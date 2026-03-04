import cron from 'node-cron';
import { scrapeActionNetwork, launchBrowser } from './scraper.js';
import { createScrapingJob, updateJobStatus, savePublicBettingData } from './database.js';

const SPORTS = process.env.SPORT
  ? [process.env.SPORT.toLowerCase()]
  : ['nba', 'nfl', 'nhl'];
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000]; // 30s, 60s, 120s between retries

// Single long-lived browser shared across all scrape runs to prevent Chrome OOM
let sharedBrowser = null;

async function ensureBrowser() {
  if (sharedBrowser && sharedBrowser.isConnected()) return sharedBrowser;

  // Close stale browser if disconnected
  if (sharedBrowser) {
    try { await sharedBrowser.close(); } catch {}
    sharedBrowser = null;
  }

  sharedBrowser = await launchBrowser();

  sharedBrowser.on('disconnected', () => {
    console.log('⚠️  Browser disconnected — will relaunch on next scrape run');
    sharedBrowser = null;
  });

  return sharedBrowser;
}

// Prevent overlapping scrape runs
let isRunning = false;

async function runAllSports(label = 'Scheduled') {
  if (isRunning) {
    console.log(`⏭️  ${label} scrape skipped — previous run still in progress`);
    return;
  }
  isRunning = true;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 ${label} multi-sport scrape starting at ${new Date().toLocaleString()}`);
  console.log('='.repeat(60));
  try {
    const browser = await ensureBrowser();
    for (const sport of SPORTS) {
      await runScrapeJob(sport, browser);
      if (SPORTS.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  } finally {
    isRunning = false;
  }
}

export async function startScheduler() {
  console.log('⏰ Starting multi-sport scheduler...');
  console.log(`📅 Will scrape ${SPORTS.join(', ').toUpperCase()} every 5 minutes`);

  // Launch browser once at startup
  await ensureBrowser();

  console.log(`🕐 Next run: ${new Date(Date.now() + 5 * 60 * 1000).toLocaleTimeString()}\n`);

  // Run every 5 minutes
  cron.schedule('*/5 * * * *', () => runAllSports('Scheduled'));

  console.log('▶️  Running initial full scrape...\n');
  runAllSports('Initial');
}

async function retryWithBackoff(fn, label) {
  let lastError;
  for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt <= RETRY_DELAYS_MS.length) {
        const delaySec = RETRY_DELAYS_MS[attempt - 1] / 1000;
        console.error(`  ❌ Attempt ${attempt}/${RETRY_DELAYS_MS.length + 1} failed for ${label}: ${error.message}`);
        console.error(`  ⏳ Retrying in ${delaySec}s...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
      } else {
        console.error(`  ❌ All ${RETRY_DELAYS_MS.length + 1} attempts failed for ${label}. Giving up until next scheduled run.`);
      }
    }
  }
  throw lastError;
}

async function runScrapeJob(sport, browser) {
  const startTime = Date.now();
  const job = createScrapingJob(sport);

  try {
    const games = await retryWithBackoff(
      () => scrapeActionNetwork(sport, browser),
      `${sport.toUpperCase()} scrape`
    );

    if (games.length > 0) {
      await savePublicBettingData(games);
    }

    const incompleteGames = games.filter(
      g => g.spread_line == null || g.total_line == null || g.ml_home_odds == null
    );
    updateJobStatus(job, 'completed', {
      gamesScraped: games.length,
      gamesIncomplete: incompleteGames.length,
      durationMs: Date.now() - startTime,
    });
    console.log(`🕐 Next run: ${new Date(Date.now() + 5 * 60 * 1000).toLocaleTimeString()}\n`);

  } catch (error) {
    updateJobStatus(job, 'failed', {
      errorMessage: error.message,
      durationMs: Date.now() - startTime,
    });
  }
}
