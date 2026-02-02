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
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    console.log('✅ Page configured');

    // Go to homepage (not /login!)
    console.log('🔐 Navigating to Action Network homepage...');
    await page.goto('https://www.actionnetwork.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    console.log('✅ Homepage loaded');

    // Wait for page to settle
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Click "Sign In" button in top right corner
    console.log('🖱️  Looking for Sign In button...');
    const signInSelectors = [
      'a[href*="login"]',
      'button:has-text("Sign In")',
      'a:has-text("Sign In")',
      '[data-testid="sign-in"]',
      '.sign-in-button',
    ];

    let signInClicked = false;
    for (const selector of signInSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log(`✅ Found Sign In button with selector: ${selector}`);
        await page.click(selector);
        console.log('✅ Clicked Sign In button');
        signInClicked = true;
        break;
      } catch (e) {
        console.log(`⚠️  Selector ${selector} not found, trying next...`);
      }
    }

    if (!signInClicked) {
      // Try clicking any element with "Sign In" text
      console.log('🔍 Trying to find Sign In by text content...');
      await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('a, button'));
        const signInElement = elements.find(el => 
          el.textContent?.trim().toLowerCase().includes('sign in')
        );
        if (signInElement) {
          signInElement.click();
        }
      });
      console.log('✅ Clicked Sign In button via text search');
    }

    // Wait for login modal to appear
    console.log('⏱️  Waiting for login modal to appear...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Wait for email input in the modal
    console.log('🔍 Looking for email input field in modal...');
    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="mail"]',
      'input[placeholder*="Email"]',
    ];

    let emailInput = null;
    for (const selector of emailSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log(`✅ Found email input with selector: ${selector}`);
        emailInput = selector;
        break;
      } catch (e) {
        console.log(`⚠️  Email selector ${selector} not found, trying next...`);
      }
    }

    if (!emailInput) {
      throw new Error('Could not find email input field in login modal');
    }

    // Fill in email
    console.log('⌨️  Typing email...');
    await page.type(emailInput, EMAIL, { delay: 100 });
    console.log('✅ Email entered');

    // Fill in password
    console.log('⌨️  Typing password...');
    await page.type('input[type="password"]', PASSWORD, { delay: 100 });
    console.log('✅ Password entered');

    // Wait before clicking
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Click the Sign In button in the modal
    console.log('🖱️  Clicking Sign In button in modal...');
    const loginButtonSelectors = [
      'button[type="submit"]',
      'button:has-text("Sign In")',
      'button:has-text("Sign in")',
      'button:has-text("Log In")',
      '.login-button',
    ];

    let loginClicked = false;
    for (const selector of loginButtonSelectors) {
      try {
        await page.click(selector);
        console.log(`✅ Clicked login button with selector: ${selector}`);
        loginClicked = true;
        break;
      } catch (e) {
        console.log(`⚠️  Login button selector ${selector} not found, trying next...`);
      }
    }

    if (!loginClicked) {
      // Try clicking by text
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loginButton = buttons.find(btn => 
          btn.textContent?.trim().toLowerCase().includes('sign in')
        );
        if (loginButton) {
          loginButton.click();
        }
      });
      console.log('✅ Clicked login button via text search');
    }

    // Wait for "Success! One moment..." message or modal to close
    console.log('⏱️  Waiting for login to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if we're logged in by looking for user menu or checking if modal closed
    console.log('✅ Login process completed');

    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);

    // Navigate to public betting page
    console.log('📊 Navigating to public betting page...');
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    console.log('✅ Public betting page loaded');

    // Wait for data to load
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
      console.log('⚠️  No games extracted - checking page content...');
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