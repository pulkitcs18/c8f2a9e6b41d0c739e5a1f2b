import cron from 'node-cron';
import { scrapeActionNetwork } from './scraper.js';
import { createScrapingJob, updateJobStatus, savePublicBettingData } from './database.js';

const SPORT = process.env.SPORT || 'nba';

export function startScheduler() {
  console.log('⏰ Starting scheduler...');
  console.log(`📅 Will scrape ${SPORT.toUpperCase()} every 2 hours`);
  console.log(`🕐 Next run: ${new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleTimeString()}\n`);

  // Run every 2 hours (at minute 0 of every even hour)
  cron.schedule('0 */2 * * *', async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Scheduled scrape starting at ${new Date().toLocaleString()}`);
    console.log('='.repeat(60));
    await runScrapeJob();
  });

  console.log('▶️  Running initial scrape...\n');
  runScrapeJob();
}

async function runScrapeJob() {
  const startTime = Date.now();
  let job = null;

  try {
    job = await createScrapingJob(SPORT);
    const games = await scrapeActionNetwork(SPORT);

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
