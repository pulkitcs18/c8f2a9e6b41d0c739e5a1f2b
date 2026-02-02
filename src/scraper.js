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

    // Navigate to public betting page with All Markets filter
    // Try the URL with query parameter first (some sites support this)
    console.log('📊 Navigating to public betting page...');

    // First try with market=all query param
    const allMarketsUrl = `${url}?market=all`;
    console.log(`📊 Trying All Markets URL: ${allMarketsUrl}`);

    await page.goto(allMarketsUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    console.log('✅ Public betting page loaded');

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if we got All Markets or need to click the dropdown
    const currentFilter = await page.evaluate(() => {
      // Look for the filter indicator - what does the dropdown currently show?
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.textContent?.trim();
        const rect = el.getBoundingClientRect();

        // Find elements that look like dropdown values near top of page
        if (rect.top < 200 && rect.width > 50 && rect.width < 300) {
          if (text === 'All Markets' || text === 'Spread' || text === 'Total' || text === 'Moneyline') {
            return text;
          }
        }
      }
      return 'unknown';
    });

    console.log(`📊 Current filter appears to be: ${currentFilter}`);

    // ==================== SELECT "ALL MARKETS" ====================
    // Skip if already showing All Markets (URL param worked)
    if (currentFilter === 'All Markets') {
      console.log('✅ Already showing All Markets - no dropdown click needed');
    } else {
      console.log('🖱️  Need to select All Markets from dropdown...');

      // Step 1: Find and click the Spread/market dropdown
      console.log('🖱️  Step 1: Looking for market dropdown...');

      const spreadDropdownFound = await page.evaluate(() => {
        // Find all elements in the filter area that could be dropdowns
        const candidates = [];

        document.querySelectorAll('*').forEach(el => {
          const text = el.textContent?.trim();
          const rect = el.getBoundingClientRect();
          const tagName = el.tagName.toLowerCase();

          // Look for Spread text in a small, clickable element near page top
          if (text === 'Spread' &&
            rect.top > 50 && rect.top < 250 &&
            rect.height > 20 && rect.height < 60 &&
            rect.width > 60 && rect.width < 400) {

            candidates.push({
              element: el,
              tag: tagName,
              classes: el.className,
              top: rect.top,
              left: rect.left
            });
          }
        });

        console.log('Spread candidates:', candidates.length);

        // Find the innermost element (most specific) to click
        if (candidates.length > 0) {
          // Sort by element depth (we want the deepest/most specific element)
          candidates.sort((a, b) => {
            const depthA = getDepth(a.element);
            const depthB = getDepth(b.element);
            return depthB - depthA;
          });

          function getDepth(el) {
            let depth = 0;
            let current = el;
            while (current.parentElement) {
              depth++;
              current = current.parentElement;
            }
            return depth;
          }

          // Click the most specific element
          const toClick = candidates[0];
          console.log('Clicking:', toClick.tag, toClick.classes);
          toClick.element.click();
          return true;
        }

        return false;
      });

      if (spreadDropdownFound) {
        console.log('✅ Clicked something in the Spread area');
      } else {
        console.log('⚠️  Could not find Spread dropdown');
      }

      // Wait for dropdown menu to appear
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 2: Look for All Markets option and click it
      console.log('🖱️  Step 2: Looking for All Markets option...');

      const allMarketsClicked = await page.evaluate(() => {
        // Find elements with exact "All Markets" text
        const candidates = [];

        document.querySelectorAll('*').forEach(el => {
          const text = el.textContent?.trim();
          const rect = el.getBoundingClientRect();

          // Look for "All Markets" - it should be visible and small enough to be a menu item
          if (text === 'All Markets' &&
            rect.width > 0 && rect.height > 0 &&
            rect.width < 300 && rect.height < 60) {

            candidates.push({
              element: el,
              tag: el.tagName.toLowerCase(),
              width: rect.width,
              height: rect.height
            });
          }
        });

        console.log('All Markets candidates:', candidates.length);

        if (candidates.length > 0) {
          // Click the first visible All Markets element
          for (const c of candidates) {
            try {
              c.element.click();
              console.log('Clicked All Markets:', c.tag, c.width, c.height);
              return true;
            } catch (e) {
              console.log('Click failed:', e.message);
            }
          }
        }

        return false;
      });

      if (allMarketsClicked) {
        console.log('✅ Selected All Markets');
      } else {
        console.log('⚠️  Could not click All Markets - trying alternate approaches...');

        // Try Tab + Enter navigation as fallback
        try {
          // Press Tab 3 times to get to the dropdown, then arrow down to All Markets
          await page.keyboard.press('Tab');
          await page.keyboard.press('Tab');
          await page.keyboard.press('Tab');
          await page.keyboard.press('Enter'); // Open dropdown
          await new Promise(resolve => setTimeout(resolve, 500));
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('Enter'); // Select All Markets (4th option)
          console.log('✅ Used keyboard navigation for All Markets');
        } catch (e) {
          console.log('⚠️  Keyboard navigation failed:', e.message);
        }
      }
    }

    // Wait for page to update with all markets data
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Page ready for data extraction');

    // ==================== HTML STRUCTURE DEBUG ====================
    console.log('🔍 Starting HTML structure debug...');

    const htmlDebug = await page.evaluate(() => {
      const rows = document.querySelectorAll('tbody tr');
      const samples = [];

      for (let i = 0; i < Math.min(3, rows.length); i++) {
        const row = rows[i];
        const cells = Array.from(row.querySelectorAll('td, th'));

        samples.push({
          rowIndex: i,
          fullText: row.textContent.trim(),
          fullHTML: row.outerHTML.substring(0, 1000),
          cells: cells.map((cell, idx) => ({
            cellIndex: idx,
            text: cell.textContent.trim(),
            classes: cell.className,
            html: cell.innerHTML.substring(0, 300)
          }))
        });
      }

      return { totalRows: rows.length, samples };
    });

    console.log('\n========================================');
    console.log('🔍 HTML STRUCTURE DEBUG');
    console.log('========================================');
    console.log('Total rows found:', htmlDebug.totalRows);

    htmlDebug.samples.forEach(row => {
      console.log(`\n--- ROW ${row.rowIndex} ---`);
      console.log('Full text:', row.fullText.substring(0, 250));
      console.log('\nCells breakdown:');
      row.cells.forEach(c => {
        console.log(`  Cell ${c.cellIndex}:`);
        console.log(`    Text: "${c.text.substring(0, 80)}"`);
        console.log(`    Classes: "${c.classes}"`);
        console.log(`    HTML snippet: ${c.html.substring(0, 150)}`);
      });
      console.log('\nRow HTML:', row.fullHTML);
      console.log('---');
    });
    console.log('========================================\n');
    // ==================== END HTML DEBUG ====================

    // Extract data
    console.log('📥 Extracting betting data...');
    const games = await page.evaluate((sportName) => {
      const results = [];
      const gameMap = new Map();

      const rows = document.querySelectorAll('tbody tr');
      console.log(`Found ${rows.length} total rows`);

      rows.forEach((row, index) => {
        try {
          const text = row.textContent;

          // Extract team names
          const teamNames = [];
          const cells = row.querySelectorAll('td, div, span');

          cells.forEach(cell => {
            let cellText = cell.textContent?.trim();
            if (!cellText) return;

            // Remove common suffixes and numbers
            cellText = cellText
              .replace(/[A-Z]{2,3}\d{3}/g, '') // Remove NOP551, CHA552
              .replace(/\d+/g, '') // Remove all numbers
              .replace(/[^\w\s]/g, '') // Remove special chars
              .trim();

            if (cellText.length >= 3 && cellText.length <= 20) {
              const isTeamName = /^[A-Za-z]+$/.test(cellText) || cellText === '76ers';
              const excludeWords = ['spread', 'total', 'moneyline', 'open', 'best', 'odds', 'bets', 'money', 'diff', 'scheduled'];
              const isExcluded = excludeWords.some(word => cellText.toLowerCase().includes(word));

              if (isTeamName && !isExcluded && !teamNames.includes(cellText)) {
                teamNames.push(cellText);
              }
            }
          });

          if (teamNames.length < 2) {
            return;
          }

          const awayTeam = teamNames[0];
          const homeTeam = teamNames[1];
          const gameKey = `${awayTeam}_${homeTeam}`;

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

          if (percentMatches && percentMatches.length >= 2) {
            const bets = parseInt(percentMatches[0].replace('%', ''));
            const money = parseInt(percentMatches[1].replace('%', ''));
            const diff = money - bets;

            const betCountMatch = text.match(/(\d{1,3}(?:,\d{3})+|\d{4,})/);
            const betCount = betCountMatch ? parseInt(betCountMatch[0].replace(/,/g, '')) : null;

            const hasOverLine = /o\d{3}/.test(text);
            const hasUnderLine = /u\d{3}/.test(text);
            const hasSpreadLine = /[+-]\d+\.?\d*/.test(text) && !hasOverLine && !hasUnderLine;

            if (hasOverLine) {
              game.over_bets_pct = bets;
              game.over_money_pct = money;
              game.under_bets_pct = 100 - bets;
              game.under_money_pct = 100 - money;
              game.total_diff = diff;
              if (betCount) game.total_bets = betCount;

              const totalLineMatch = text.match(/o(\d{3}(?:\.\d)?)/);
              if (totalLineMatch) {
                game.total_line = parseFloat(totalLineMatch[1]);
              }
            } else if (hasUnderLine) {
              if (!game.total_bets && betCount) {
                game.total_bets = betCount;
              }
            } else if (hasSpreadLine && !game.spread_home_bets_pct) {
              game.spread_away_bets_pct = bets;
              game.spread_away_money_pct = money;
              game.spread_home_bets_pct = 100 - bets;
              game.spread_home_money_pct = 100 - money;
              game.spread_diff = diff;
              if (betCount) game.spread_total_bets = betCount;

              const spreadMatch = text.match(/([+-]\d+\.?\d*)/);
              if (spreadMatch) {
                game.spread_line = parseFloat(spreadMatch[0]);
              }
            }
          }

        } catch (err) {
          console.error(`Error parsing row ${index}:`, err.message);
        }
      });

      gameMap.forEach(game => {
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