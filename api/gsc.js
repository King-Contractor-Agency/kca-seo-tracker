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
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token error: ' + JSON.stringify(data));
  return data.access_token;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const callerToken = (req.headers.authorization || '').replace('Bearer ', '');
  if (!callerToken) { res.status(401).json({ error: 'No token' }); return; }

  try {
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + callerToken }
    });
    const user = await userRes.json();
    if (!user.email || !user.email.toLowerCase().endsWith('@kingcontractor.com')) {
      res.status(403).json({ error: 'Unauthorized' }); return;
    }

    const accessToken = await getAccessToken();
    const { siteUrl, type } = req.query;
    if (!siteUrl) { res.status(400).json({ error: 'Missing siteUrl' }); return; }

    const end   = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 28);
    const fmt = d => d.toISOString().slice(0, 10);

    const base = 'https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteUrl) + '/searchAnalytics/query';
    const hdrs = { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' };

    const body = type === 'totals'
      ? JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: [], rowLimit: 1 })
      : JSON.stringify({ startDate: fmt(start), endDate: fmt(end), dimensions: ['query'], rowLimit: 10 });

    const gscRes = await fetch(base, { method: 'POST', headers: hdrs, body });

    if (!gscRes.ok) {
      const err = await gscRes.json().catch(() => ({}));
      res.status(gscRes.status).json({ error: err.error?.message || 'GSC error' }); return;
    }

    const data = await gscRes.json();
    res.status(200).json(data);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
