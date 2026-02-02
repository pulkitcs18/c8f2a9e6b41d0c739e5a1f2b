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

    // Go to homepage
    console.log('🔐 Navigating to Action Network homepage...');
    await page.goto('https://www.actionnetwork.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    console.log('✅ Homepage loaded');

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Click Sign In button
    console.log('🖱️  Looking for Sign In button...');
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button'));
      const signInElement = elements.find(el => 
        el.textContent?.trim().toLowerCase().includes('sign in')
      );
      if (signInElement) {
        signInElement.click();
      }
    });
    console.log('✅ Clicked Sign In button');

    // Wait for login modal
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fill in login form
    console.log('🔍 Looking for email input field...');
    await page.waitForSelector('input[name="email"]', { timeout: 10000 });
    console.log('✅ Found email input');
    
    await page.type('input[name="email"]', EMAIL, { delay: 100 });
    console.log('✅ Email entered');
    
    await page.type('input[type="password"]', PASSWORD, { delay: 100 });
    console.log('✅ Password entered');

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Click login button
    console.log('🖱️  Clicking Sign In button...');
    await page.click('button[type="submit"]');
    console.log('✅ Login button clicked');

    // Wait for login to complete
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Login completed');

    // Navigate to public betting page
    console.log('📊 Navigating to public betting page...');
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    console.log('✅ Public betting page loaded');

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Click the "Spread" dropdown to change to "All Markets"
    console.log('🖱️  Looking for market filter dropdown...');
    
    const dropdownSelectors = [
      'button:has-text("Spread")',
      '[data-testid*="market-filter"]',
      'button[aria-label*="market"]',
      'select',
      'button:has-text("Total")',
      'button:has-text("Moneyline")',
    ];

    // Try to click the dropdown
    let dropdownClicked = false;
    for (const selector of dropdownSelectors) {
      try {
        await page.click(selector);
        console.log(`✅ Clicked dropdown with selector: ${selector}`);
        dropdownClicked = true;
        break;
      } catch (e) {
        // Try next selector
      }
    }

    if (!dropdownClicked) {
      // Try clicking by text
      console.log('🔍 Trying to find dropdown by text...');
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const dropdownButton = buttons.find(btn => 
          btn.textContent?.trim().toLowerCase().includes('spread') ||
          btn.textContent?.trim().toLowerCase().includes('total') ||
          btn.textContent?.trim().toLowerCase().includes('moneyline')
        );
        if (dropdownButton) {
          dropdownButton.click();
        }
      });
      console.log('✅ Clicked dropdown via text search');
    }

    // Wait for dropdown menu to appear
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Click "All Markets" option
    console.log('🖱️  Selecting "All Markets" option...');
    await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('button, div, span, li'));
      const allMarketsOption = allElements.find(el => 
        el.textContent?.trim().toLowerCase() === 'all markets'
      );
      if (allMarketsOption) {
        allMarketsOption.click();
      }
    });
    console.log('✅ Selected "All Markets"');

    // Wait for page to update with all markets
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Page updated with all markets');

    // Extract data
    console.log('📥 Extracting betting data...');
    const games = await page.evaluate((sportName) => {
      const results = [];
      const gameMap = new Map(); // Track games by matchup
      
      // Find all table rows
      const rows = document.querySelectorAll('tbody tr');
      console.log(`Found ${rows.length} total rows`);

      rows.forEach((row, index) => {
        try {
          const text = row.textContent;
          console.log(`\nRow ${index}: ${text.substring(0, 150)}`);
          
          // Extract team names - look for text before numbers
          const teamNames = [];
          const cells = row.querySelectorAll('td, div');
          
          cells.forEach(cell => {
            const cellText = cell.textContent?.trim();
            // Team names are typically 2-20 characters, all letters
            if (cellText && cellText.length >= 3 && cellText.length <= 20) {
              // Common NBA team names
              const teamPattern = /^[A-Za-z0-9\s]+$/;
              if (teamPattern.test(cellText) && !cellText.includes('%') && !cellText.includes('+') && !cellText.includes('-') && !cellText.includes('.')) {
                teamNames.push(cellText);
              }
            }
          });
          
          console.log(`Team names found:`, teamNames.slice(0, 4));
          
          if (teamNames.length < 2) {
            console.log('Skipping - not enough team names');
            return;
          }
          
          // First two distinct names are the teams
          const awayTeam = teamNames[0];
          const homeTeam = teamNames[1];
          const gameKey = `${awayTeam}_${homeTeam}`;
          
          console.log(`Processing game: ${awayTeam} @ ${homeTeam}`);
          
          // Get or create game object
          if (!gameMap.has(gameKey)) {
            gameMap.set(gameKey, {
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
            });
          }
          
          const game = gameMap.get(gameKey);
          
          // Extract percentages
          const percentMatches = text.match(/(\d{1,3})%/g);
          console.log(`Percentages:`, percentMatches?.slice(0, 6));
          
          // Determine row type by looking for indicators
          const isSpreadRow = text.includes('+') && text.includes('-') && !text.includes('o') && !text.includes('u');
          const isTotalRow = text.includes('o2') || text.includes('u2') || text.includes('o1') || text.includes('u1');
          const isMoneylineRow = !isTotalRow && (text.match(/[+-]\d{3}/g)?.length || 0) >= 1;
          
          if (percentMatches && percentMatches.length >= 2) {
            const bets = parseInt(percentMatches[0]);
            const money = parseInt(percentMatches[1]);
            const diff = money - bets;
            
            // Extract bet count
            const betCountMatch = text.match(/(\d{1,3}(?:,\d{3})+|\d{4,})/);
            const betCount = betCountMatch ? parseInt(betCountMatch[0].replace(/,/g, '')) : null;
            
            console.log(`Data: ${bets}% bets, ${money}% money, diff: ${diff}%, count: ${betCount}`);
            
            // Assign to appropriate market type
            if (isTotalRow && text.includes('o')) {
              // Over row
              game.over_bets_pct = bets;
              game.over_money_pct = money;
              game.total_diff = diff;
              game.total_bets = betCount;
              
              const totalLineMatch = text.match(/o(\d{3}(?:\.\d)?)/);
              if (totalLineMatch) game.total_line = parseFloat(totalLineMatch[1]);
              
              console.log(`✅ Assigned to OVER`);
            } else if (isTotalRow && text.includes('u')) {
              // Under row - just record bet count if not set
              if (!game.total_bets && betCount) {
                game.total_bets = betCount;
              }
              console.log(`✅ Assigned to UNDER (count only)`);
            } else if (!game.spread_home_bets_pct) {
              // First occurrence - assume spread
              game.spread_home_bets_pct = 100 - bets;
              game.spread_home_money_pct = 100 - money;
              game.spread_away_bets_pct = bets;
              game.spread_away_money_pct = money;
              game.spread_diff = diff;
              game.spread_total_bets = betCount;
              
              const spreadMatch = text.match(/([+-]\d+(?:\.\d)?)/);
              if (spreadMatch) game.spread_line = parseFloat(spreadMatch[0]);
              
              console.log(`✅ Assigned to SPREAD`);
            }
          }
          
        } catch (err) {
          console.error(`Error parsing row ${index}:`, err.message);
        }
      });

      // Convert map to array
      gameMap.forEach(game => {
        console.log(`Final game: ${game.away_team} @ ${game.home_team} - Spread: ${game.spread_diff}%, Total: ${game.total_diff}%`);
        results.push(game);
      });

      return results;
    }, sport);

    console.log(`✅ Extracted ${games.length} games`);
    
    if (games.length > 0) {
      console.log('📄 Sample game:', JSON.stringify(games[0], null, 2));
    } else {
      console.log('⚠️  No games extracted');
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