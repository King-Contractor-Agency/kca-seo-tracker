// api/gsc.js
// Vercel serverless function — fetches GSC data using analytics@kingcontractor.com credentials
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Verify caller is a signed-in KCA user
  const callerToken = req.headers.authorization?.replace('Bearer ', '');
  if (!callerToken) { res.status(401).json({ error: 'No caller token provided' }); return; }

  try {
    // Verify the caller is @kingcontractor.com
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + callerToken }
    });
    const user = await userRes.json();
    if (!user.email || !user.email.toLowerCase().endsWith('@kingcontractor.com')) {
      res.status(403).json({ error: 'Unauthorized domain' }); return;
    }

    // Get analytics@ access token
    const accessToken = await getAccessToken();

    const { siteUrl, type } = req.query;
    if (!siteUrl) { res.status(400).json({ error: 'Missing siteUrl' }); return; }

    const base = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const hdrs = {
      Authorization:  'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    };

    const endDate   = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 28);
    const fmt = d => d.toISOString().slice(0, 10);

    if (type === 'totals') {
      const r = await fetch(base, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate), dimensions: [], rowLimit: 1 }),
      });
      const data = r.ok ? await r.json() : {};
      res.status(200).json(data);
    } else {
      // queries
      const r = await fetch(base, {
        method: 'POST', headers: hdrs,
        body: JSON.stringify({ startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ['query'], rowLimit: 10 }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        res.status(r.status).json({ error: err.error?.message || 'GSC API error' }); return;
      }
      const data = await r.json();
      res.status(200).json(data);
    }

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
