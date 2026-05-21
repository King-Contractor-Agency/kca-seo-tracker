// Vercel serverless function: /api/fetch
// Drop into your GitHub repo at: api/fetch.js
// Vercel auto-deploys this as an endpoint at /api/fetch?url=...
//
// Purpose: server-side proxy so the browser can read robots.txt / llms.txt /
// sitemap.xml / homepage HTML for any client domain without CORS issues.
// No public CORS proxy needed.

export default async function handler(req, res) {
  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ ok: false, status: 400, text: '', error: 'Missing url query param' });
  }

  // Basic safety: only allow http/https URLs
  let parsed;
  try {
    parsed = new URL(target);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('Invalid protocol');
    }
  } catch (e) {
    return res.status(400).json({ ok: false, status: 400, text: '', error: 'Invalid URL' });
  }

  // Allow CORS so the dashboard can also call this from any origin during dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Cache successful responses for 5 minutes at the Vercel edge
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        'User-Agent': 'KCA-SEO-Tracker/1.0 (+https://kingcontractor.com/)',
        'Accept': '*/*',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await upstream.text();
    return res.status(200).json({
      ok: upstream.ok,
      status: upstream.status,
      text,
      finalUrl: upstream.url,
    });
  } catch (e) {
    clearTimeout(timer);
    return res.status(200).json({
      ok: false,
      status: 0,
      text: '',
      error: e.name === 'AbortError' ? 'Timeout after 10s' : (e.message || 'Fetch failed'),
    });
  }
}
