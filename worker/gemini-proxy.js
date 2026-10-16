// Macro Lens shared Gemini server, for Cloudflare Workers (free plan is plenty).
// It keeps your Gemini key secret and passes the app's requests to Google, so every phone that opens
// your copy of Macro Lens can use Gemini without its own key.
//
// In Cloudflare: Workers & Pages → your worker → Settings → Variables and Secrets:
//   GEMINI_KEY       Secret  your key from aistudio.google.com/apikey            (required)
//   ALLOWED_ORIGINS  Text    sites allowed to use it, comma-separated             (optional, default below)
//   HOURLY_LIMIT     Text    requests per hour from one internet connection       (optional, default 40)
//
// Keep billing OFF on the Google project behind the key: then nobody can run up a bill,
// the worst case is the free daily quota running out and the app falling back to on-device recognition.

const DEFAULT_ORIGINS = 'https://athanbriggs-hub.github.io';
const MODELS = new Set(['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest']);
const MAX_BYTES = 8 * 1024 * 1024;
const hits = new Map();   // per-connection counts, best effort (each Cloudflare server keeps its own)

export default {
  async fetch(req, env) {
    const origin = (req.headers.get('Origin') || '').replace(/\/+$/, '');
    const allowed = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors = {'Access-Control-Allow-Origin': ok ? origin : (allowed[0] || 'null'), 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin'};
    const fail = (code, kind, message) => new Response(JSON.stringify({error: {code, status: 'MACROLENS', macrolens: kind, message}}),
      {status: code, headers: {...cors, 'Content-Type': 'application/json'}});

    if (req.method === 'OPTIONS') return new Response(null, {status: ok ? 204 : 403, headers: cors});
    if (!ok) return fail(403, 'key', 'This Gemini server only answers the Macro Lens app.');
    if (!env.GEMINI_KEY) return fail(500, 'key', 'The shared Gemini server has no GEMINI_KEY secret yet.');
    const m = new URL(req.url).pathname.match(/^\/v1beta\/models\/([a-z0-9.\-]+):generateContent$/);
    if (req.method !== 'POST' || !m) return fail(404, 'model', 'Not found.');
    if (!MODELS.has(m[1])) return fail(404, 'model', 'That model isn’t allowed on this server.');
    if (Number(req.headers.get('Content-Length') || 0) > MAX_BYTES) return fail(413, 'bad', 'That photo is too large.');

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown', k = `${ip}:${Math.floor(Date.now() / 3600e3)}`;
    const n = (hits.get(k) || 0) + 1; hits.set(k, n);
    if (hits.size > 5000) hits.clear();
    if (n > (Number(env.HOURLY_LIMIT) || 40)) return fail(429, 'rate', 'Lots of Gemini requests from this connection in the last hour. Try again later.');

    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m[1]}:generateContent`,
        {method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY}, body: req.body});
    } catch {
      return fail(502, 'server', 'The shared server couldn’t reach Gemini.');
    }
    const h = new Headers(cors);
    h.set('Content-Type', r.headers.get('Content-Type') || 'application/json');
    return new Response(r.body, {status: r.status, headers: h});
  },
};
