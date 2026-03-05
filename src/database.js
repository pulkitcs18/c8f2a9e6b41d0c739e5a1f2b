// src/database.js - Direct Supabase integration
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export function createScrapingJob(sport) {
  console.log(`\n--- [${sport.toUpperCase()}] Scrape job started at ${new Date().toISOString()} ---`);
  return { id: `${sport}-${Date.now()}`, sport };
}

export function updateJobStatus(job, status, summary = {}) {
  const { gamesScraped = 0, gamesIncomplete = 0, errorMessage = null, durationMs = 0 } = summary;
  const ts = new Date().toISOString();
  if (status === 'completed') {
    console.log(`[${job.sport.toUpperCase()}] ✅ COMPLETED at ${ts}`);
    console.log(`  Games written:   ${gamesScraped}`);
    if (gamesIncomplete > 0) {
      console.log(`  Incomplete data: ${gamesIncomplete} game(s) missing spread / total / ML`);
    }
    console.log(`  Runtime:         ${(durationMs / 1000).toFixed(1)}s`);
  } else {
    console.error(`[${job.sport.toUpperCase()}] ❌ FAILED at ${ts} after ${(durationMs / 1000).toFixed(1)}s`);
    if (errorMessage) console.error(`  Error: ${errorMessage}`);
  }
}

export async function savePublicBettingData(games) {
  if (games.length === 0) {
    console.log('⚠️  No games to save');
    return;
  }

  try {
    console.log(`📤 Saving ${games.length} games to Supabase...`);

    const now = new Date().toISOString();
    const rows = games.map(game => {
      const row = {
        game_id: game.game_id,
        sport: game.sport,
        scheduled_time: game.scheduled_time,
        home_team: game.home_team,
        away_team: game.away_team,
        spread_line: game.spread_line,
        spread_home_bets_pct: game.spread_home_bets_pct,
        spread_home_money_pct: game.spread_home_money_pct,
        total_line: game.total_line,
        over_bets_pct: game.over_bets_pct,
        over_money_pct: game.over_money_pct,
        ml_home_odds: game.ml_home_odds != null ? String(game.ml_home_odds) : null,
        ml_away_odds: game.ml_away_odds != null ? String(game.ml_away_odds) : null,
        ml_home_bets_pct: game.ml_home_bets_pct,
        ml_home_money_pct: game.ml_home_money_pct,
        spread_open_away: game.spread_open_away,
        spread_open_home: game.spread_open_home,
        total_open_away: game.total_open_away,
        total_open_home: game.total_open_home,
        ml_open_away: game.ml_open_away,
        ml_open_home: game.ml_open_home,
        scraped_at: now,
        updated_at: now,
      };
      // Only include total_bets when we actually scraped it,
      // so we don't overwrite existing data with null
      if (game.total_bets != null) {
        row.total_bets = game.total_bets;
      }
      return row;
    });

    // Upsert by game_id so re-scraping updates existing rows
    const { data, error } = await supabase
      .from('action_network_public_betting')
      .upsert(rows, { onConflict: 'game_id' });

    if (error) {
      throw new Error(`Supabase upsert failed: ${error.message}`);
    }

    console.log(`✅ Saved ${games.length} games to database`);
    return { games_saved: games.length };
  } catch (error) {
    console.error('❌ Failed to save data:', error.message);
    throw error;
  }
}

export async function testConnection() {
  try {
    console.log(`🔌 Testing connection to Supabase: ${SUPABASE_URL}`);

    const { count, error } = await supabase
      .from('action_network_public_betting')
      .select('*', { count: 'exact', head: true });

    if (error) {
      throw new Error(`Query failed: ${error.message}`);
    }

    console.log(`✅ Supabase connection successful (${count} existing rows)`);
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}
