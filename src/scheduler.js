import cron from 'node-cron';
import { scrapeActionNetwork } from './scraper.js';
import { createScrapingJob, updateJobStatus, savePublicBettingData } from './database.js';

const SPORTS = ['nba', 'nfl', 'nhl'];

export function startScheduler() {
  console.log('⏰ Starting multi-sport scheduler...');
  console.log(`📅 Will scrape ${SPORTS.join(', ').toUpperCase()} every 2 hours`);
  console.log(`🕐 Next run: ${new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleTimeString()}\n`);

  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Scheduled multi-sport scrape starting at ${new Date().toLocaleString()}`);
    console.log('='.repeat(60));

    for (const sport of SPORTS) {
      await runScrapeJob(sport);
      // Wait 30 seconds between sports to avoid rate limiting or overlap
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  });

  console.log('▶️  Running initial full scrape...\n');
  (async () => {
    for (const sport of SPORTS) {
      await runScrapeJob(sport);
    }
  })();
}

async function runScrapeJob(sport) {
  const startTime = Date.now();
  let job = null;

  try {
    job = await createScrapingJob(sport);
    const games = await scrapeActionNetwork(sport);

    if (games.length > 0) {
      await savePublicBettingData(games);
    }

    const duration = Date.now() - startTime;
    await updateJobStatus(job.id, 'completed', games.length, null, duration);

    console.log(`\n✅ Job completed in ${duration}ms`);
    console.log(`📊 Scraped ${games.length} games`);
    console.log(`🕐 Next run: ${new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleTimeString()}\n`);

  } catch (error) {
    console.error('\n❌ Job failed:', error.message);

    if (job) {
      const duration = Date.now() - startTime;
      await updateJobStatus(job.id, 'failed', 0, error.message, duration);
    }
  }
}
