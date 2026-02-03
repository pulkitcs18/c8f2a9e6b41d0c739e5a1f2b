// src/database.js - Updated to use Lovable API endpoint

const LOVABLE_ENDPOINT = process.env.LOVABLE_API_ENDPOINT;
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY;

if (!LOVABLE_ENDPOINT || !SCRAPER_API_KEY) {
  console.error('❌ Missing Scraper credentials!');
  console.error('Required: LOVABLE_API_ENDPOINT and SCRAPER_API_KEY');
  process.exit(1);
}

export async function createScrapingJob(sport = 'NBA') {
  // Job creation will be handled by the Lovable endpoint
  console.log(`✅ Will create scraping job for ${sport} via Lovable API`);
  return { id: 'pending', sport, status: 'running' };
}

export async function updateJobStatus(
  jobId,
  status,
  gamesScraped = 0,
  errorMessage = null,
  duration = 0
) {
  // Job updates handled by Lovable endpoint
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
    console.log(`📤 Sending ${games.length} games to Lovable endpoint...`);

    const response = await fetch(LOVABLE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SCRAPER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sport: games[0]?.sport || 'NBA',
        games,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API request failed: ${response.status} - ${errorText}`
      );
    }

    const result = await response.json();
    console.log(
      `✅ Saved ${result.games_saved || games.length} games to database`
    );
    console.log(`📊 Response:`, JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    console.error('❌ Failed to save data:', error.message);
    throw error;
  }
}

export async function testConnection() {
  try {
    console.log(`🔌 Testing connection to: ${LOVABLE_ENDPOINT}`);

    const response = await fetch(LOVABLE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SCRAPER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sport: 'NBA',
        games: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Connection test failed: ${response.status}`);
    }

    console.log('✅ Lovable API connection successful');
    return true;
  } catch (error) {
    console.error('❌ Lovable API connection failed:', error.message);
    return false;
  }
}
