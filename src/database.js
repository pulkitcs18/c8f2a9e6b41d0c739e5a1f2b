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

export async function createScrapingJob(sport = 'NBA') {
  console.log(`✅ Starting scraping job for ${sport}`);
  return { id: 'local', sport, status: 'running' };
}

export async function updateJobStatus(
  jobId,
  status,
  gamesScraped = 0,
  errorMessage = null,
  duration = 0
) {
  console.log(
    `✅ Job ${jobId}: ${status} (${gamesScraped} games, ${duration}ms)`
  );
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
