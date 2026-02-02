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
    console.log('🖱️  Looking for market filter dropdown (Spread button)...');
    
    // The dropdown is a custom button-based dropdown, NOT a native <select>
    // It appears as a button showing "Spread" next to the sport selector
    let dropdownClicked = false;
    
    // Method 1: Try to find the Spread button by looking for elements with "Spread" text
    // that are part of a dropdown/select-like component
    try {
      dropdownClicked = await page.evaluate(() => {
        // Look for all clickable elements that contain "Spread" text
        const allElements = Array.from(document.querySelectorAll('button, div[role="button"], [class*="select"], [class*="dropdown"], [class*="filter"]'));
        
        for (const el of allElements) {
          const text = el.textContent?.trim();
          // Find element that shows "Spread" and looks like a dropdown trigger
          if (text === 'Spread' || text?.toLowerCase() === 'spread') {
            console.log('Found Spread dropdown button:', el.className);
            el.click();
            return true;
          }
        }
        
        // Also try looking for parent containers with dropdown classes
        const dropdownTriggers = document.querySelectorAll('[class*="Dropdown"], [class*="Select"], [class*="trigger"]');
        for (const trigger of dropdownTriggers) {
          if (trigger.textContent?.includes('Spread')) {
            console.log('Found dropdown trigger with Spread:', trigger.className);
            trigger.click();
            return true;
          }
        }
        
        return false;
      });
      
      if (dropdownClicked) {
        console.log('✅ Clicked Spread dropdown button');
      }
    } catch (e) {
      console.log('⚠️  Method 1 failed:', e.message);
    }
    
    // Method 2: If method 1 failed, try clicking any element that exactly matches "Spread"
    if (!dropdownClicked) {
      console.log('🔍 Trying alternative method to find Spread dropdown...');
      try {
        // Look for the dropdown by its position - it should be near the sport selector
        dropdownClicked = await page.evaluate(() => {
          // Find all elements and look for one that's a dropdown showing "Spread"
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
          );
          
          let node;
          while (node = walker.nextNode()) {
            const text = node.textContent?.trim();
            const directText = Array.from(node.childNodes)
              .filter(n => n.nodeType === Node.TEXT_NODE)
              .map(n => n.textContent.trim())
              .join('');
            
            // Look for elements where the direct text content is "Spread"
            if (directText === 'Spread' || 
                (node.tagName === 'BUTTON' && text === 'Spread') ||
                (node.getAttribute('role') === 'button' && text === 'Spread')) {
              console.log('Found Spread element:', node.tagName, node.className);
              node.click();
              return true;
            }
          }
          
          // Last resort: click by XPath-like approach
          const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
          const spreadBtn = buttons.find(b => {
            const rect = b.getBoundingClientRect();
            // Button should be visible and have "Spread" in it
            return rect.width > 0 && rect.height > 0 && 
                   b.textContent?.trim().includes('Spread') &&
                   !b.textContent?.includes('%'); // Exclude percentage displays
          });
          
          if (spreadBtn) {
            console.log('Found Spread button by visibility check:', spreadBtn.className);
            spreadBtn.click();
            return true;
          }
          
          return false;
        });
        
        if (dropdownClicked) {
          console.log('✅ Clicked Spread dropdown via alternative method');
        }
      } catch (e) {
        console.log('⚠️  Method 2 failed:', e.message);
      }
    }
    
    // Method 3: Use page.click with XPath or specific selectors
    if (!dropdownClicked) {
      console.log('🔍 Trying direct CSS selectors for dropdown...');
      const selectors = [
        'button:has-text("Spread")',
        '[data-testid*="market"]',
        '[class*="market-select"]',
        '[class*="MarketSelect"]',
        '.public-betting button',
      ];
      
      for (const selector of selectors) {
        try {
          await page.click(selector);
          console.log(`✅ Clicked dropdown with selector: ${selector}`);
          dropdownClicked = true;
          break;
        } catch (e) {
          // Continue to next selector
        }
      }
    }
    
    if (!dropdownClicked) {
      console.log('⚠️  Could not find Spread dropdown, trying to take screenshot for debugging...');
    }

    // Wait for dropdown menu to appear
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Click "All Markets" option from the dropdown menu
    console.log('🖱️  Looking for "All Markets" option in dropdown menu...');
    const allMarketsClicked = await page.evaluate(() => {
      // The dropdown menu should now be visible
      // Look for the "All Markets" option
      const allElements = Array.from(document.querySelectorAll('button, div, span, li, a, [role="option"], [role="menuitem"]'));
      
      for (const el of allElements) {
        const text = el.textContent?.trim().toLowerCase();
        if (text === 'all markets') {
          console.log('Found All Markets option:', el.tagName, el.className);
          el.click();
          return true;
        }
      }
      
      // Also check for elements with specific dropdown item classes
      const dropdownItems = document.querySelectorAll('[class*="dropdown-item"], [class*="menu-item"], [class*="option"]');
      for (const item of dropdownItems) {
        if (item.textContent?.trim().toLowerCase() === 'all markets') {
          console.log('Found All Markets in dropdown items:', item.className);
          item.click();
          return true;
        }
      }
      
      return false;
    });
    
    if (allMarketsClicked) {
      console.log('✅ Selected "All Markets"');
    } else {
      console.log('⚠️  Could not find "All Markets" option - dropdown may not have opened');
    }

    // Wait for page to update with all markets data
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log('✅ Page updated (waiting for all markets data)');

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