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
startScheduler();

process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});
