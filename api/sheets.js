// api/sheets.js
// Vercel serverless function — fetches Google Sheets data using analytics@kingcontractor.com credentials
// All @kingcontractor.com users get the same data view

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://kca-seo-tracker.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Verify caller is a signed-in KCA user (they pass their own OAuth token)
  const callerToken = req.headers.authorization?.replace('Bearer ', '');
  if (!callerToken) { res.status(401).json({ error: 'No caller token provided' }); return; }

  try {
    // Verify the caller is @kingcontractor.com
    const userRes  = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + callerToken }
    });
    const user = await userRes.json();
    if (!user.email || !user.email.toLowerCase().endsWith('@kingcontractor.com')) {
      res.status(403).json({ error: 'Unauthorized domain' }); return;
    }

    // Get analytics@ access token
    const accessToken = await getAccessToken();

    const { sheetId, sheetTab } = req.query;
    if (!sheetId || !sheetTab) { res.status(400).json({ error: 'Missing sheetId or sheetTab' }); return; }

    const range    = encodeURIComponent(`${sheetTab}!A1:Z2000`);
    const sheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );

    if (!sheetRes.ok) {
      const err = await sheetRes.json().catch(() => ({}));
      res.status(sheetRes.status).json({ error: err.error?.message || 'Sheets API error' }); return;
    }

    const data = await sheetRes.json();
    res.status(200).json({ values: data.values || [] });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
