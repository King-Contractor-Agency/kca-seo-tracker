const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;

async function getAccessToken() {
  const params = 'client_id=' + encodeURIComponent(CLIENT_ID) +
    '&client_secret=' + encodeURIComponent(CLIENT_SECRET) +
    '&refresh_token=' + encodeURIComponent(REFRESH_TOKEN) +
    '&grant_type=refresh_token';

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('No access token. Check env vars. Got: ' + JSON.stringify(data));
  return data.access_token;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Quick env check
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    res.status(500).json({ error: 'Missing env vars', has: { CLIENT_ID: !!CLIENT_ID, CLIENT_SECRET: !!CLIENT_SECRET, REFRESH_TOKEN: !!REFRESH_TOKEN } });
    return;
  }

  const callerToken = (req.headers.authorization || '').replace('Bearer ', '');
  if (!callerToken) { res.status(401).json({ error: 'No caller token' }); return; }

  try {
    // Verify caller
    const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + callerToken }
    });
    const user = await userRes.json();
    if (!user.email || !user.email.toLowerCase().endsWith('@kingcontractor.com')) {
      res.status(403).json({ error: 'Unauthorized domain', email: user.email }); return;
    }

    const accessToken = await getAccessToken();
    const { sheetId, sheetTab } = req.query;
    if (!sheetId || !sheetTab) { res.status(400).json({ error: 'Missing sheetId or sheetTab' }); return; }

    const range    = encodeURIComponent(sheetTab + '!A1:Z2000');
    const sheetRes = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets/' + sheetId + '/values/' + range,
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    const data = await sheetRes.json();

    if (!sheetRes.ok) {
      res.status(sheetRes.status).json({ error: data.error?.message || 'Sheets API error', detail: data }); return;
    }

    res.status(200).json({ values: data.values || [] });

  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
};
