const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // Enforce secure headers so our frontend can access the data safely
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle standard browser pre-flight checks
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { albumUrl } = JSON.parse(event.body || '{}');
    if (!albumUrl) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing albumUrl parameter' }) };
    }

    // Extract the raw Spotify Album ID using a regex matching pattern
    const match = albumUrl.match(/album\/([a-zA-Z0-9]+)/);
    if (!match) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid Spotify Album URL' }) };
    }
    const albumId = match[1];

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing Spotify API credentials on the server' }) };
    }

    // Phase 1: Connect to Spotify token endpoint to request temporary session token
    const base64Credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64Credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Spotify auth token generation failed: ${errText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Phase 2: Fetch individual album metadata from the official Web API
    const albumResponse = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!albumResponse.ok) {
      const errText = await albumResponse.text();
      throw new Error(`Spotify API data fetch failed: ${errText}`);
    }

    const albumData = await albumResponse.json();

    // Map out clean data structure to send back down to the React frontend
    const payload = {
      title: albumData.name,
      artist: albumData.artists.map(a => a.name).join(', '),
      year: albumData.release_date ? albumData.release_date.split('-')[0] : '',
      imageUrl: albumData.images && albumData.images.length > 0 ? albumData.images[0].url : '',
      tracks: albumData.tracks.items.map(track => track.name)
    };

    return { statusCode: 200, headers, body: JSON.stringify(payload) };

  } catch (error) {
    console.error('Serverless Function Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || 'Internal Server Error' })
    };
  }
};