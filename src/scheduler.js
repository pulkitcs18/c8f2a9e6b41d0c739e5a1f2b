import cron from 'node-cron';
import { scrapeActionNetwork } from './scraper.js';
import { createScrapingJob, updateJobStatus, savePublicBettingData } from './database.js';

const SPORTS = process.env.SPORT
  ? [process.env.SPORT.toLowerCase()]
  : ['nba', 'nfl', 'nhl'];
const RETRY_DELAYS_MS = [30_000, 60_000, 120_000]; // 30s, 60s, 120s between retries

export function startScheduler() {
  console.log('⏰ Starting multi-sport scheduler...');
  console.log(`📅 Will scrape ${SPORTS.join(', ').toUpperCase()} every 5 minutes`);
  console.log(`🕐 Next run: ${new Date(Date.now() + 5 * 60 * 1000).toLocaleTimeString()}\n`);

  // Run every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Scheduled multi-sport scrape starting at ${new Date().toLocaleString()}`);
    console.log('='.repeat(60));

    for (const sport of SPORTS) {
      await runScrapeJob(sport);
      // Wait 10 seconds between sports to avoid rate limiting or overlap
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  });

  console.log('▶️  Running initial full scrape...\n');
  (async () => {
    for (const sport of SPORTS) {
      await runScrapeJob(sport);
    }
  })();
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

async function runScrapeJob(sport) {
  const startTime = Date.now();
  const job = createScrapingJob(sport);

  try {
    const games = await retryWithBackoff(
      () => scrapeActionNetwork(sport),
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
