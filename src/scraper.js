import puppeteer from 'puppeteer';

const EMAIL = process.env.ACTION_NETWORK_EMAIL;
const PASSWORD = process.env.ACTION_NETWORK_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('❌ Missing Action Network credentials!');
  console.error('Required: ACTION_NETWORK_EMAIL and ACTION_NETWORK_PASSWORD');
  process.exit(1);
}

// Helper function to select a league from the dropdown
async function selectLeague(page, sport) {
  const sportUpper = sport.toUpperCase();
  console.log(`\n🏆 Selecting sport: ${sportUpper}...`);

  try {
    const selector = '[data-testid="odds-tools-sub-nav__league-dropdown"] select';
    await page.waitForSelector(selector, { timeout: 10000 });

    // Select by value (nba, nfl, nhl, etc.)
    await page.select(selector, sport.toLowerCase());
    console.log(`  ✅ Selected ${sportUpper}`);

    // Wait for page to reload data
    await new Promise(resolve => setTimeout(resolve, 3000));
    return true;
  } catch (error) {
    console.log(`  ⚠️  Warning: Could not select sport ${sportUpper} via dropdown: ${error.message}`);
    console.log(`  Continuing with current page...`);
    return false;
  }
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
async function extractMarketData(page, marketType, sport = 'nba') {
  console.log(`📥 Extracting ${marketType} data for ${sport.toUpperCase()}...`);

  const data = await page.evaluate((market, sportType) => {
    const results = [];
    const rows = document.querySelectorAll('tbody tr');

    // Sport-specific nicknames for proper matching
    const SPORT_NICKNAMES = {
      'NBA': [
        'Hawks', 'Celtics', 'Nets', 'Hornets', 'Bulls', 'Cavaliers',
        'Mavericks', 'Nuggets', 'Pistons', 'Warriors', 'Rockets',
        'Pacers', 'Clippers', 'Lakers', 'Grizzlies', 'Heat', 'Bucks',
        'Timberwolves', 'Pelicans', 'Knicks', 'Thunder', 'Magic',
        '76ers', 'Suns', 'Blazers', 'Kings', 'Spurs', 'Raptors',
        'Jazz', 'Wizards'
      ],
      'NFL': [
        'Cardinals', 'Falcons', 'Ravens', 'Bills', 'Panthers', 'Bears',
        'Bengals', 'Browns', 'Cowboys', 'Broncos', 'Lions', 'Packers',
        'Texans', 'Colts', 'Jaguars', 'Chiefs', 'Raiders', 'Chargers',
        'Rams', 'Dolphins', 'Vikings', 'Patriots', 'Saints', 'Giants',
        'Jets', 'Eagles', 'Steelers', '49ers', 'Seahawks', 'Buccaneers',
        'Titans', 'Commanders'
      ],
      'NHL': [
        'Ducks', 'Bruins', 'Sabres', 'Flames', 'Hurricanes', 'Blackhawks',
        'Avalanche', 'Blue Jackets', 'Stars', 'Red Wings', 'Oilers',
        'Panthers', 'Kings', 'Wild', 'Canadiens', 'Predators', 'Devils',
        'Islanders', 'Rangers', 'Senators', 'Flyers', 'Penguins', 'Sharks',
        'Kraken', 'Blues', 'Lightning', 'Maple Leafs', 'Canucks',
        'Golden Knights', 'Capitals', 'Jets', 'Utah'
      ]
    };

    const nicknames = SPORT_NICKNAMES[sportType.toUpperCase()] || SPORT_NICKNAMES['NBA'];

    // Helper to find nickname from text
    const findNickname = (text) => {
      if (!text) return null;
      for (const nick of nicknames) {
        if (text.includes(nick)) return nick;
      }
      return null;
    };

    rows.forEach((row, index) => {
      try {
        const text = row.textContent || '';

        // Extract team names from game-info elements
        const teamElements = row.querySelectorAll('.game-info__team--desktop span, .game-info__team-info span, [class*="team"] span');
        const teamNames = [];

        teamElements.forEach(el => {
          const cellText = el.textContent?.trim();
          if (!cellText) return;

          // Try to find an NBA nickname in this element
          const nickname = findNickname(cellText);
          if (nickname && !teamNames.includes(nickname)) {
            teamNames.push(nickname);
          }
        });

        // Fallback: search the whole row text for team names
        if (teamNames.length < 2) {
          for (const nick of nicknames) {
            if (text.includes(nick) && !teamNames.includes(nick)) {
              teamNames.push(nick);
              if (teamNames.length >= 2) break;
            }
          }
        }

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
          totalBets: parseInt((row.querySelector('.public-betting__number-of-bets')?.textContent || '').replace(/,/g, '')) || null,
        });

      } catch (err) {
        console.error('Row parse error:', err.message);
      }
    });

    return results;
  }, marketType, sport);

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

    await page.setViewport({ width: 1920, height: 5000 });
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

    // ==================== EXTRACT total_bets FROM __NEXT_DATA__ ====================
    const numBetsMap = await page.evaluate(() => {
      const games = window.__NEXT_DATA__?.props?.pageProps?.scoreboardResponse?.games || [];
      const map = {};
      for (const g of games) {
        if (g.num_bets == null) continue;
        // Collect all name variants per team (display_name + short_name)
        const t0 = g.teams?.[0], t1 = g.teams?.[1];
        if (!t0 || !t1) continue;
        const names0 = [...new Set([t0.display_name, t0.short_name].filter(Boolean))];
        const names1 = [...new Set([t1.display_name, t1.short_name].filter(Boolean))];
        // Store both orderings for every name combination
        for (const n0 of names0) {
          for (const n1 of names1) {
            map[`${n0}_${n1}`] = g.num_bets;
            map[`${n1}_${n0}`] = g.num_bets;
          }
        }
      }
      return map;
    });
    console.log(`📊 Extracted num_bets from __NEXT_DATA__ for ${Object.keys(numBetsMap).length} games:`);
    for (const [key, val] of Object.entries(numBetsMap)) {
      console.log(`  ${key}: ${val}`);
    }

    // Choose the sport from dropdown as requested
    await selectLeague(page, sport);

    // Wait for page to fully render after possible reload
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

    // 1. Scrape SPREAD
    // Viewport is set to 5000px tall so all rows start within the viewport on load.
    // The bets count text is populated by an intersection observer — with height=5000
    // all rows are initially visible, IO fires for all games, no scrolling needed.
    console.log('\n====== SCRAPING SPREAD DATA ======');
    const spreadData = await extractMarketData(page, 'Spread', sport);

    for (const row of spreadData) {
      const gameKey = `${row.awayTeam}_${row.homeTeam}`;
      if (!gameDataMap.has(gameKey)) {
        gameDataMap.set(gameKey, {
          game_id: `${sport.toLowerCase()}_${row.awayTeam.replace(/\s+/g, '_')}_${row.homeTeam.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`,
          sport: sport.toUpperCase(),
          scheduled_time: new Date().toISOString(),
          home_team: row.homeTeam,
          away_team: row.awayTeam,
          spread_line: null,
          spread_home_bets_pct: null,
          spread_home_money_pct: null,
          total_line: null,
          over_bets_pct: null,
          over_money_pct: null,
          ml_home_odds: null,
          ml_away_odds: null,
          ml_home_bets_pct: null,
          ml_home_money_pct: null,
          total_bets: null,
        });
      }

      const game = gameDataMap.get(gameKey);
      if (row.line1) {
        const spreadMatch = row.line1.match(/([+-]?\d+\.?\d*)/);
        if (spreadMatch) {
          game.spread_line = parseFloat(spreadMatch[1]);
        }
      }
      game.spread_home_bets_pct = row.homeBetsPct;
      game.spread_home_money_pct = row.homeMoneyPct;
      if (row.totalBets != null) {
        game.total_bets = row.totalBets;
      }
    }

    // 2. Scrape TOTAL
    console.log('\n====== SCRAPING TOTAL DATA ======');
    const totalSelected = await selectMarketType(page, 'Total', sport);

    if (totalSelected) {
      const totalData = await extractMarketData(page, 'Total', sport);

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
          // Store over percentages only (new schema)
          game.over_bets_pct = row.awayBetsPct;
          game.over_money_pct = row.awayMoneyPct;
        }
      }
    }

    // 3. Scrape MONEYLINE
    console.log('\n====== SCRAPING MONEYLINE DATA ======');
    const mlSelected = await selectMarketType(page, 'Moneyline', sport);

    if (mlSelected) {
      const mlData = await extractMarketData(page, 'Moneyline', sport);

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
          // Store home percentages for moneyline (new schema)
          game.ml_home_bets_pct = row.homeBetsPct;
          game.ml_home_money_pct = row.homeMoneyPct;
        }
      }
    }

    // Apply total_bets from __NEXT_DATA__ JSON (reliable, no DOM/IO needed)
    for (const [gameKey, game] of gameDataMap) {
      if (numBetsMap[gameKey] != null) {
        game.total_bets = numBetsMap[gameKey];
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