import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials!');
  console.error('Required: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function createScrapingJob(sport = 'NBA') {
  try {
    const { data, error } = await supabase
      .from('action_network_scrape_jobs')
      .insert({
        job_type: 'public_betting',
        sport: sport.toUpperCase(),
        status: 'running',
      })
      .select()
      .single();

    if (error) throw error;
    console.log(`✅ Created scraping job: ${data.id}`);
    return data;
  } catch (error) {
    console.error('❌ Failed to create job:', error.message);
    throw error;
  }
}

export async function updateJobStatus(jobId, status, gamesScraped = 0, errorMessage = null, duration = 0) {
  try {
    const { error } = await supabase
      .from('action_network_scrape_jobs')
      .update({
        status,
        games_scraped: gamesScraped,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
        duration_ms: duration,
      })
      .eq('id', jobId);

    if (error) throw error;
    console.log(`✅ Updated job ${jobId}: ${status} (${gamesScraped} games)`);
  } catch (error) {
    console.error('❌ Failed to update job:', error.message);
  }
}

export async function savePublicBettingData(games) {
  if (games.length === 0) {
    console.log('⚠️  No games to save');
    return;
  }

  try {
    const { error } = await supabase
      .from('action_network_public_betting')
      .insert(games);

    if (error) throw error;
    console.log(`✅ Saved ${games.length} games to database`);
  } catch (error) {
    console.error('❌ Failed to save data:', error.message);
    throw error;
  }
}

export async function testConnection() {
  try {
    const { data, error } = await supabase
      .from('action_network_public_betting')
      .select('count')
      .limit(1);

    if (error) throw error;
    console.log('✅ Supabase connection successful');
    return true;
  } catch (error) {
    console.error('❌ Supabase connection failed:', error.message);
    return false;
  }
}
