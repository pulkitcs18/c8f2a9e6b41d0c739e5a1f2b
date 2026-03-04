import dotenv from 'dotenv';
import { testConnection } from './database.js';
import { startScheduler } from './scheduler.js';

dotenv.config();

console.log('🚀 SharpEdge Action Network Scraper');
console.log('='.repeat(60));
console.log(`📅 Started at: ${new Date().toLocaleString()}`);
console.log(`🏀 Sport: ${process.env.SPORT || 'NBA'}`);
console.log('='.repeat(60) + '\n');

console.log('🔌 Testing database connection...');
const connected = await testConnection();

if (!connected) {
  console.error('\n❌ Cannot connect to Supabase. Exiting...');
  process.exit(1);
}

console.log('');
await startScheduler();

process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

// Prevent unhandled rejections/exceptions from killing the process between cron runs
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception (keeping process alive):', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection (keeping process alive):', reason);
});

// Keep the event loop alive between cron runs (Railway may GC idle processes)
setInterval(() => {
  console.log(`💓 Heartbeat — ${new Date().toISOString()} — process alive`);
}, 4 * 60 * 1000); // every 4 minutes
