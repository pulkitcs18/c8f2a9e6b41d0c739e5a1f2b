import puppeteer from 'puppeteer';

const EMAIL = process.env.ACTION_NETWORK_EMAIL;
const PASSWORD = process.env.ACTION_NETWORK_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('❌ Missing Action Network credentials!');
  console.error('Required: ACTION_NETWORK_EMAIL and ACTION_NETWORK_PASSWORD');
  process.exit(1);
}

export async function scrapeActionNetwork(sport = 'nba') {
  const url = `https://www.actionnetwork.com/${sport.toLowerCase()}/public-betting`;
  console.log(`\n🔍 Starting scrape: ${url}`);
  
  let browser;
  
  try {
    console.log('🌐 Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
    console.log('✅ Browser launched');

    const page = await browser.newPage();
    
    // Enable request/response logging
    page.on('request', request => {
      console.log(`📤 Request: ${request.method()} ${request.url().substring(0, 100)}`);
    });
    
    page.on('response', response => {
      console.log(`📥 Response: ${response.status()} ${response.url().substring(0, 100)}`);
    });
    
    page.on('console', msg => {
      console.log(`🖥️  Page Console: ${msg.text()}`);
    });
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    console.log('✅ Page configured');

    console.log('🔐 Navigating to login page...');
    console.log('⏱️  Timeout set to 5 minutes (300 seconds)');
    
    // Try to navigate with 5 minute timeout
    const startTime = Date.now();
    try {
      await page.goto('https://www.actionnetwork.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 300000, // 5 minutes
      });
      const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ Login page loaded in ${loadTime} seconds`);
    } catch (navError) {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`❌ Navigation failed after ${elapsedTime} seconds`);
      
      // Try to get current page content for debugging
      const currentUrl = page.url();
      const pageTitle = await page.title().catch(() => 'Unable to get title');
      console.log(`📍 Current URL: ${currentUrl}`);
      console.log(`📄 Page Title: ${pageTitle}`);
      
      // Take a screenshot if possible
      try {
        await page.screenshot({ path: '/tmp/login-timeout.png' });
        console.log('📸 Screenshot saved to /tmp/login-timeout.png');
      } catch (e) {
        console.log('⚠️  Could not take screenshot');
      }
      
      throw navError;
    }

    // Check if we actually got to login page
    const currentUrl = page.url();
    const pageTitle = await page.title();
    console.log(`📍 Current URL: ${currentUrl}`);
    console.log(`📄 Page Title: ${pageTitle}`);

    // Wait for login form with increased timeout
    console.log('🔍 Looking for email input field...');
    await page.waitForSelector('input[type="email"], input[name="email"]', { 
      timeout: 30000
    });
    console.log('✅ Found email input field');
    
    // Add small delay
    console.log('⏱️  Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Fill login form
    console.log('⌨️  Typing email...');
    await page.type('input[type="email"], input[name="email"]', EMAIL, { delay: 100 });
    console.log('✅ Email entered');
    
    console.log('⌨️  Typing password...');
    await page.type('input[type="password"], input[name="password"]', PASSWORD, { delay: 100 });
    console.log('✅ Password entered');

    // Wait before clicking
    console.log('⏱️  Waiting 1 second before clicking login...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Click login button
    console.log('🖱️  Clicking login button...');
    await Promise.all([
      page.waitForNavigation({ 
        waitUntil: 'domcontentloaded',
        timeout: 120000 // 2 minutes
      }),
      page.click('button[type="submit"]'),
    ]);

    console.log('✅ Logged in successfully');
    
    // Check where we ended up
    const afterLoginUrl = page.url();
    console.log(`📍 After login URL: ${afterLoginUrl}`);
    
    // Wait after login
    console.log('⏱️  Waiting 3 seconds after login...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('📊 Navigating to public betting page...');
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 120000, // 2 minutes
    });
    console.log('✅ Public betting page loaded');

    // Wait for data
    console.log('⏱️  Waiting 5 seconds for data to load...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('📥 Extracting betting data...');
    const games = await page.evaluate((sportName) => {
      const results = [];
      const selectors = [
        'tr[data-testid*="game"]',
        'tr[class*="game"]',
        '.game-row',
        'tbody tr'
      ];
      
      let gameRows = [];
      for (const selector of selectors) {
        gameRows = document.querySelectorAll(selector);
        if (gameRows.length > 0) {
          console.log(`Found ${gameRows.length} rows with selector: ${selector}`);
          break;
        }
      }

      console.log(`Total game rows found: ${gameRows.length}`);

      gameRows.forEach((row, index) => {
        try {
          const teamElements = row.querySelectorAll('[class*="team"], .team-name, td');
          if (teamElements.length < 2) return;

          const teams = Array.from(teamElements)
            .map(el => el.textContent?.trim())
            .filter(text => text && text.length > 2 && text.length < 30);

          if (teams.length < 2) return;

          const awayTeam = teams[0];
          const homeTeam = teams[1];

          const game = {
            game_id: `${awayTeam.replace(/\s+/g, '_')}_${homeTeam.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`,
            sport: sportName.toUpperCase(),
            scheduled_time: new Date().toISOString(),
            home_team: homeTeam,
            away_team: awayTeam,
            spread_line: null,
            spread_home_bets_pct: null,
            spread_home_money_pct: null,
            spread_away_bets_pct: null,
            spread_away_money_pct: null,
            spread_diff: null,
            spread_total_bets: null,
            total_line: null,
            over_bets_pct: null,
            over_money_pct: null,
            under_bets_pct: null,
            under_money_pct: null,
            total_diff: null,
            total_bets: null,
            ml_home_odds: null,
            ml_away_odds: null,
            ml_diff: null,
            ml_total_bets: null,
          };

          const allText = row.textContent;
          const percentMatches = allText.match(/(\d{1,3})%/g);
          
          if (percentMatches && percentMatches.length >= 4) {
            game.spread_away_bets_pct = parseInt(percentMatches[0]);
            game.spread_away_money_pct = parseInt(percentMatches[1]);
            game.spread_home_bets_pct = 100 - game.spread_away_bets_pct;
            game.spread_home_money_pct = 100 - game.spread_away_money_pct;
            game.spread_diff = game.spread_home_money_pct - game.spread_home_bets_pct;
          }

          if (percentMatches && percentMatches.length >= 8) {
            game.over_bets_pct = parseInt(percentMatches[4]);
            game.over_money_pct = parseInt(percentMatches[5]);
            game.under_bets_pct = 100 - game.over_bets_pct;
            game.under_money_pct = 100 - game.over_money_pct;
            game.total_diff = game.over_money_pct - game.over_bets_pct;
          }

          const betMatches = allText.match(/[\d,]+(?=\s|$)/g);
          if (betMatches) {
            const betCounts = betMatches
              .map(m => parseInt(m.replace(/,/g, '')))
              .filter(n => n > 100 && n < 1000000);
            
            if (betCounts.length > 0) {
              game.spread_total_bets = betCounts[0];
              if (betCounts.length > 1) game.total_bets = betCounts[1];
            }
          }

          const diffMatches = allText.match(/([+-]\d{1,2})%/g);
          if (diffMatches && diffMatches.length > 0) {
            game.spread_diff = parseInt(diffMatches[0]);
            if (diffMatches.length > 1) game.total_diff = parseInt(diffMatches[1]);
          }

          console.log(`Parsed game ${index + 1}: ${awayTeam} @ ${homeTeam}`);
          results.push(game);
        } catch (err) {
          console.error(`Error parsing row ${index}:`, err.message);
        }
      });

      return results;
    }, sport);

    console.log(`✅ Extracted ${games.length} games`);
    
    if (games.length > 0) {
      console.log('📄 Sample game:', JSON.stringify(games[0], null, 2));
    } else {
      console.log('⚠️  No games extracted - page might not have loaded correctly');
      
      // Get page HTML for debugging
      const bodyHTML = await page.evaluate(() => document.body.innerHTML);
      console.log('📄 Page HTML snippet:', bodyHTML.substring(0, 500));
    }

    await browser.close();
    console.log('✅ Browser closed');
    return games;

  } catch (error) {
    console.error('❌ Scraping failed:', error.message);
    console.error('Stack trace:', error.stack);
    if (browser) {
      await browser.close();
      console.log('✅ Browser closed after error');
    }
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧪 Running scraper test...\n');
  import('dotenv/config');
  
  scrapeActionNetwork('nba')
    .then(games => {
      console.log(`\n✅ Test complete: ${games.length} games scraped`);
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    });
}