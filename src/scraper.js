import puppeteer from 'puppeteer';

const EMAIL = process.env.ACTION_NETWORK_EMAIL;
const PASSWORD = process.env.ACTION_NETWORK_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('❌ Missing Action Network credentials!');
  console.error('Required: ACTION_NETWORK_EMAIL and ACTION_NETWORK_PASSWORD');
  process.exit(1);
}

// Helper function to select a market type using the native HTML <select> element
// Based on HTML structure: <select> with options: spread, total, ml, combined
async function selectMarketType(page, marketType, sport = 'nba') {
  console.log(`\n� Selecting "${marketType}" from dropdown...`);

  // Map market type names to option values from the HTML
  const marketValues = {
    'Spread': 'spread',
    'Total': 'total',
    'Moneyline': 'ml',
    'All Markets': 'combined'
  };

  const optionValue = marketValues[marketType];
  if (!optionValue) {
    console.log(`  ⚠️  Unknown market type: ${marketType}`);
    return false;
  }

  console.log(`  Using value: "${optionValue}"`);

  // Find and select from the native <select> element
  // The select is inside div[data-testid="odds-tools-sub-nav__odds-type"]
  try {
    // Try multiple selectors to find the select element
    const selectors = [
      '[data-testid="odds-tools-sub-nav__odds-type"] select',
      '.odds-tools-sub-nav__odds-type select',
      'select[name=""]',
      'select',
    ];

    let selected = false;
    for (const selector of selectors) {
      try {
        // Check if selector exists
        const exists = await page.$(selector);
        if (exists) {
          console.log(`  Found select element with selector: ${selector}`);

          // Use page.select() to change the value
          await page.select(selector, optionValue);
          console.log(`  ✅ Selected "${marketType}" (value: ${optionValue})`);
          selected = true;
          break;
        }
      } catch (e) {
        // Try next selector
      }
    }

    if (!selected) {
      // Fallback: Try using evaluate to directly set the select value
      console.log('  Trying direct DOM manipulation...');
      await page.evaluate((value) => {
        const selectElements = document.querySelectorAll('select');
        for (const sel of selectElements) {
          // Check if this select has our options
          const options = Array.from(sel.options).map(o => o.value);
          if (options.includes('spread') && options.includes('total') && options.includes('ml')) {
            sel.value = value;
            // Trigger change event
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('Set select value to:', value);
            return true;
          }
        }
        return false;
      }, optionValue);
      console.log(`  ✅ Set value via DOM manipulation`);
      selected = true;
    }

    // Wait for page to update with new data
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Verify the change
    const currentValue = await page.evaluate(() => {
      const selectElements = document.querySelectorAll('select');
      for (const sel of selectElements) {
        const options = Array.from(sel.options).map(o => o.value);
        if (options.includes('spread') && options.includes('total') && options.includes('ml')) {
          return sel.value;
        }
      }
      return 'unknown';
    });
    console.log(`  📊 Current select value: "${currentValue}"`);

    return currentValue === optionValue;

  } catch (error) {
    console.log(`  ❌ Error selecting market: ${error.message}`);
    return false;
  }
}

// Helper function to extract data for current market type
async function extractMarketData(page, marketType) {
  console.log(`📥 Extracting ${marketType} data...`);

  const data = await page.evaluate((market) => {
    const results = [];
    const rows = document.querySelectorAll('tbody tr');

    rows.forEach((row, index) => {
      try {
        const text = row.textContent || '';

        // Extract team names from game-info elements
        const teamElements = row.querySelectorAll('.game-info__team--desktop span, .game-info__team-info span');
        const teamNames = [];
        teamElements.forEach(el => {
          const name = el.textContent?.trim();
          if (name && name.length > 2 && name.length < 25 && /^[A-Za-z0-9\s]+$/.test(name)) {
            if (!teamNames.includes(name)) {
              teamNames.push(name);
            }
          }
        });

        // Need at least 2 teams
        if (teamNames.length < 2) return;

        const awayTeam = teamNames[0];
        const homeTeam = teamNames[1];

        // Extract percentages
        const percentElements = row.querySelectorAll('.public-betting__percent, [class*="percent"]');
        const percentages = [];
        percentElements.forEach(el => {
          const match = el.textContent?.match(/(\d{1,3})%/);
          if (match) {
            percentages.push(parseInt(match[1]));
          }
        });

        // Extract odds/line from BEST ODDS column
        const oddsElements = row.querySelectorAll('.book-cell__odds, [data-testid="book-cell__odds"]');
        let line1 = null, line2 = null;
        oddsElements.forEach((el, i) => {
          const oddsText = el.textContent?.trim();
          if (i === 0) line1 = oddsText;
          if (i === 1) line2 = oddsText;
        });

        // Extract bet count
        const betsElement = row.querySelector('.public-betting__number-of-bets, [class*="number-of-bets"]');
        let totalBets = null;
        if (betsElement) {
          const betsMatch = betsElement.textContent?.match(/([\d,]+)/);
          if (betsMatch) {
            totalBets = parseInt(betsMatch[1].replace(/,/g, ''));
          }
        }

        // Extract diff percentage
        const diffElement = row.querySelector('.public-betting__diff-percentage, [class*="diff"]');
        let diff = null;
        if (diffElement) {
          const diffMatch = diffElement.textContent?.match(/([+-]?\d+)%?/);
          if (diffMatch) {
            diff = parseInt(diffMatch[1]);
          }
        }

        results.push({
          awayTeam,
          homeTeam,
          market,
          line1,
          line2,
          awayBetsPct: percentages[0] || null,
          homeBetsPct: percentages[1] || null,
          awayMoneyPct: percentages[2] || null,
          homeMoneyPct: percentages[3] || null,
          diff,
          totalBets,
          rowIndex: index,
        });

      } catch (err) {
        console.error('Row parse error:', err.message);
      }
    });

    return results;
  }, marketType);

  console.log(`  Extracted ${data.length} rows for ${marketType}`);
  return data;
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

    // ==================== LOGIN ====================
    console.log('🔐 Navigating to Action Network homepage...');
    await page.goto('https://www.actionnetwork.com/', {
      waitUntil: 'networkidle2',
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

    // Wait for login to complete and verify
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check if still on homepage (login succeeded) or got redirected 
    const loginStatus = await page.evaluate(() => {
      const hasSignIn = document.body?.textContent?.includes('Sign In');
      const hasMyAccount = document.body?.textContent?.includes('My Account') ||
        document.body?.textContent?.includes('Profile') ||
        document.querySelector('[class*="avatar"]') !== null;
      return { hasSignIn, hasMyAccount };
    });
    console.log(`📊 Login status - Sign In visible: ${loginStatus.hasSignIn}, Profile visible: ${loginStatus.hasMyAccount}`);

    if (loginStatus.hasSignIn && !loginStatus.hasMyAccount) {
      console.log('⚠️  Login may have failed - Sign In button still visible');
    } else {
      console.log('✅ Login completed');
    }

    // ==================== NAVIGATE TO PUBLIC BETTING ====================
    console.log('📊 Navigating to public betting page...');
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    console.log('✅ Public betting page loaded');

    // Wait for page to fully render
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Verify we're on the right page with data
    const pageCheck = await page.evaluate(() => {
      return {
        url: window.location.href,
        rowCount: document.querySelectorAll('tbody tr').length,
        hasPublicBetting: document.body?.textContent?.includes('Public Betting'),
        hasLockedContent: document.body?.textContent?.includes('Locked Content'),
      };
    });

    console.log(`📊 Page check - URL: ${pageCheck.url}`);
    console.log(`  Rows: ${pageCheck.rowCount}, Has Public Betting: ${pageCheck.hasPublicBetting}`);
    console.log(`  Has Locked Content: ${pageCheck.hasLockedContent}`);

    if (pageCheck.rowCount === 0) {
      console.log('⚠️  No rows found - waiting longer...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // ==================== SCRAPE EACH MARKET TYPE ====================
    // Initialize game data map
    const gameDataMap = new Map();

    // 1. Scrape SPREAD (default - already loaded)
    console.log('\n====== SCRAPING SPREAD DATA ======');
    const spreadData = await extractMarketData(page, 'Spread');

    for (const row of spreadData) {
      const gameKey = `${row.awayTeam}_${row.homeTeam}`;
      if (!gameDataMap.has(gameKey)) {
        gameDataMap.set(gameKey, {
          game_id: `${row.awayTeam.replace(/\s+/g, '_')}_${row.homeTeam.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`,
          sport: sport.toUpperCase(),
          scheduled_time: new Date().toISOString(),
          home_team: row.homeTeam,
          away_team: row.awayTeam,
          // Spread data
          spread_line: null,
          spread_home_bets_pct: null,
          spread_home_money_pct: null,
          spread_away_bets_pct: null,
          spread_away_money_pct: null,
          spread_diff: null,
          spread_total_bets: null,
          // Total data  
          total_line: null,
          over_bets_pct: null,
          over_money_pct: null,
          under_bets_pct: null,
          under_money_pct: null,
          total_diff: null,
          total_bets: null,
          // Moneyline data
          ml_home_odds: null,
          ml_away_odds: null,
          ml_home_bets_pct: null,
          ml_home_money_pct: null,
          ml_away_bets_pct: null,
          ml_away_money_pct: null,
          ml_diff: null,
          ml_total_bets: null,
        });
      }

      const game = gameDataMap.get(gameKey);
      // Parse spread line
      if (row.line1) {
        const spreadMatch = row.line1.match(/([+-]?\d+\.?\d*)/);
        if (spreadMatch) {
          game.spread_line = parseFloat(spreadMatch[1]);
        }
      }
      game.spread_away_bets_pct = row.awayBetsPct;
      game.spread_home_bets_pct = row.homeBetsPct;
      game.spread_away_money_pct = row.awayMoneyPct;
      game.spread_home_money_pct = row.homeMoneyPct;
      game.spread_diff = row.diff;
      game.spread_total_bets = row.totalBets;
    }

    // 2. Scrape TOTAL
    console.log('\n====== SCRAPING TOTAL DATA ======');
    const totalSelected = await selectMarketType(page, 'Total', sport);

    if (totalSelected) {
      const totalData = await extractMarketData(page, 'Total');

      for (const row of totalData) {
        const gameKey = `${row.awayTeam}_${row.homeTeam}`;
        const game = gameDataMap.get(gameKey);

        if (game) {
          // Parse total line (o230.5 format)
          if (row.line1) {
            const totalMatch = row.line1.match(/[ou]?(\d+\.?\d*)/i);
            if (totalMatch) {
              game.total_line = parseFloat(totalMatch[1]);
            }
          }
          game.over_bets_pct = row.awayBetsPct;
          game.under_bets_pct = row.homeBetsPct;
          game.over_money_pct = row.awayMoneyPct;
          game.under_money_pct = row.homeMoneyPct;
          game.total_diff = row.diff;
          game.total_bets = row.totalBets;
        }
      }
    }

    // 3. Scrape MONEYLINE
    console.log('\n====== SCRAPING MONEYLINE DATA ======');
    const mlSelected = await selectMarketType(page, 'Moneyline', sport);

    if (mlSelected) {
      const mlData = await extractMarketData(page, 'Moneyline');

      for (const row of mlData) {
        const gameKey = `${row.awayTeam}_${row.homeTeam}`;
        const game = gameDataMap.get(gameKey);

        if (game) {
          // Parse moneyline odds (+235, -290 format)
          if (row.line1) {
            const mlMatch = row.line1.match(/([+-]?\d+)/);
            if (mlMatch) {
              game.ml_away_odds = parseInt(mlMatch[1]);
            }
          }
          if (row.line2) {
            const mlMatch = row.line2.match(/([+-]?\d+)/);
            if (mlMatch) {
              game.ml_home_odds = parseInt(mlMatch[1]);
            }
          }
          game.ml_away_bets_pct = row.awayBetsPct;
          game.ml_home_bets_pct = row.homeBetsPct;
          game.ml_away_money_pct = row.awayMoneyPct;
          game.ml_home_money_pct = row.homeMoneyPct;
          game.ml_diff = row.diff;
          game.ml_total_bets = row.totalBets;
        }
      }
    }

    // Convert map to array
    const games = Array.from(gameDataMap.values());

    console.log(`\n✅ Scraped ${games.length} games with all market data`);

    if (games.length > 0) {
      console.log('📄 Sample game:');
      console.log(JSON.stringify(games[0], null, 2));
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

// Direct run for testing
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