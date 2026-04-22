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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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
    const { sheetId, sheetTab } = req.query;
    if (!sheetId || !sheetTab) { res.status(400).json({ error: 'Missing params' }); return; }

    const range = encodeURIComponent(sheetTab + '!A1:Z2000');
    const sheetRes = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + range,
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );

    if (!sheetRes.ok) {
      const err = await sheetRes.json().catch(() => ({}));
      res.status(sheetRes.status).json({ error: err.error?.message || 'Sheets error' }); return;
    }

    const data = await sheetRes.json();
    res.status(200).json({ values: data.values || [] });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
