// Munchmark Plus server, for Cloudflare Workers (the free Workers plan is plenty).
// It keeps the Gemini key secret, checks each phone's Plus license or free code, and passes the request to Google.
// Free users never reach it: they use the on-device recognizer.
//
// In Cloudflare: Workers & Pages → your worker → Settings → Variables and Secrets:
//   GEMINI_KEY       Secret  Gemini key from aistudio.google.com/apikey, on a project with billing ON   (required)
//   ADMIN_KEY        Secret  a long password of your own (12+ characters) for the codes page at /admin
//   LS_STORE_ID      Text    your Lemon Squeezy store ID (Settings → Stores), so only your licenses work  (required to sell)
//   LS_PRODUCT_IDS   Text    optional: comma-separated Lemon Squeezy product IDs that count as Plus
//   DAILY_LIMIT      Text    Gemini answers per paid license per day, default 15 (fair use). Free codes have no limit.
//   HOURLY_LIMIT     Text    requests per hour from one internet connection, default 40 (stops runaway scripts)
//   ALLOWED_ORIGINS  Text    sites allowed to use it, comma-separated (default below)
//   FREE_TIER        Text    leave unset while GEMINI_KEY is on Google's free tier (blocks the EU, UK and Switzerland,
//                            as Google requires); set to no once billing is on
//   FREE_CODES       Secret  optional: extra codes that always work, comma-separated (the codes page is easier)
// And under Settings → Bindings → Add → KV namespace: variable name CODES, pointing at a namespace you create in
// Storage & Databases → KV (for example "munchmark-codes"). The codes page keeps its codes there.
//
// Free codes: open https://<your worker address>/admin, sign in with ADMIN_KEY, and make one code per person.
// Each code works with no daily limit until you switch it off on that page (it takes up to a minute or two to apply).
//
// Before the first sale: turn billing on for the Google project, add a budget alert, and set FREE_TIER to no.
// Plus promises the paid tier, where Google doesn't use requests to improve its products.

const VERSION = 'v12.2';   // shown at the server's address, so you can tell which code Cloudflare is running
const DEFAULT_ORIGINS = 'https://munchmarkai.app, https://www.munchmarkai.app';
const MODELS = new Set(['gemini-2.5-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest']);
const MAX_BYTES = 8 * 1024 * 1024;
const LS_VALIDATE = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const GOOD_FOR = 6 * 3600e3, BAD_FOR = 10 * 60e3;   // how long a license check is remembered
const CODE_FOR = 60e3;                               // how long a free code's on/off is remembered
const hits = new Map();       // per-connection and per-license counts, best effort (each Cloudflare server keeps its own)
const licenses = new Map();   // license → {ok, plan, expires, t}
const codes = new Map();      // CODE → {meta, t}
// Google's terms allow only paid-tier Gemini for people in the EEA, Switzerland and the UK
const PAID_ONLY = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO','CH','GB']);
const list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const day = () => new Date().toISOString().slice(0, 10);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;   // Lemon Squeezy license keys look like this, so codes can't
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{3,39}$/;

function count(k){ const n = (hits.get(k) || 0) + 1; hits.set(k, n); if (hits.size > 20000) hits.clear(); return n; }

// a free code from the codes page (KV) or FREE_CODES: {meta:{name, on, created, last}} or null
async function codeRecord(code, env){
  if (list(env.FREE_CODES).some(c => c.toUpperCase() === code)) return {meta:{name:'', on:true}, fixed:true};
  if (!env.CODES) return null;
  const c = codes.get(code);
  if (c && Date.now() - c.t < CODE_FOR) return c.meta ? c : null;
  let meta = null;
  try { const r = await env.CODES.getWithMetadata('code:' + code); meta = r && r.value != null ? (r.metadata || {on:true}) : null; }
  catch { return c && c.meta ? c : null; }
  const out = {meta, t:Date.now()};
  codes.set(code, out); if (codes.size > 5000) codes.clear();
  return meta ? out : null;
}

// is this a working Munchmark Plus license or free code? {ok, kind, id, plan, expires, daily, why}
export async function checkLicense(key, env, fetcher = fetch){
  key = String(key || '').trim();
  if (!key || key.length > 200) return {ok:false, why:'missing'};
  const c = licenses.get(key);
  if (c && Date.now() - c.t < (c.ok ? GOOD_FOR : BAD_FOR)) return c;
  // the owner's free codes first, then Lemon Squeezy
  const code = key.toUpperCase(), rec = CODE_RE.test(code) ? await codeRecord(code, env) : null;
  if (rec) return rec.meta.on === false ? {ok:false, why:'code-off'}
    : {ok:true, kind:'code', id:'code:' + code, code, rec, plan:rec.meta.name ? `Free code for ${rec.meta.name}` : 'Free code', expires:null, daily:0};
  if (!env.LS_STORE_ID) return {ok:false, why:'unsold'};
  let r, j = null;
  try {
    r = await fetcher(LS_VALIDATE, {method:'POST', headers:{'Accept':'application/json', 'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({license_key:key}).toString()});
    try { j = await r.json(); } catch {}
  } catch { return c && c.ok ? c : {ok:false, why:'down'}; }   // Lemon Squeezy unreachable: keep a recent good answer
  if (!r.ok && r.status >= 500) return c && c.ok ? c : {ok:false, why:'down'};
  const lk = (j && j.license_key) || {}, meta = (j && j.meta) || {}, products = list(env.LS_PRODUCT_IDS);
  const ok = !!(j && j.valid) && !['expired', 'disabled'].includes(lk.status) && String(meta.store_id) === String(env.LS_STORE_ID).trim()
    && (!products.length || products.includes(String(meta.product_id)));
  const out = {ok, kind:'license', id:key, daily:0, plan:ok ? [meta.product_name, meta.variant_name].filter(x => x && x !== 'Default').join(' · ') || 'Munchmark Plus' : '',
    expires:ok ? lk.expires_at || null : null, why:ok ? '' : lk.status === 'expired' ? 'expired' : 'invalid', t:Date.now()};
  licenses.set(key, out); if (licenses.size > 5000) licenses.clear();
  return out;
}

// remember the day a code was last used (one write per code per day at most)
function touch(lic, env, ctx){
  if (lic.kind !== 'code' || !lic.rec || lic.rec.fixed || !env.CODES || lic.rec.meta.last === day()) return;
  lic.rec.meta = {...lic.rec.meta, last:day()};
  const p = env.CODES.put('code:' + lic.code, '1', {metadata:lic.rec.meta}).catch(() => {});
  if (ctx && ctx.waitUntil) ctx.waitUntil(p);
}

/* ---------- the codes page ---------- */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCode(name){
  const r = new Uint8Array(6); crypto.getRandomValues(r);
  const tail = [...r].map(b => ALPHABET[b % ALPHABET.length]).join('');
  const head = String(name || '').toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g, '').slice(0, 12);
  return (head.length >= 2 ? head + '-' : 'MUNCH-') + tail;
}
function same(a, b){   // compare without leaking how much matched
  a = String(a || ''); b = String(b || '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
async function admin(req, env, ip){
  const out = (code, body) => new Response(JSON.stringify(body), {status:code, headers:{'Content-Type':'application/json', 'Cache-Control':'no-store'}});
  const url = new URL(req.url), origin = req.headers.get('Origin');
  if (req.method !== 'POST' || (origin && origin !== url.origin)) return out(405, {error:'Not allowed.'});
  if (!env.ADMIN_KEY || String(env.ADMIN_KEY).length < 12) return out(503, {error:'Add an ADMIN_KEY secret of 12 or more characters to the worker first.'});
  const tries = `admin:${ip}:${Math.floor(Date.now() / 3600e3)}`;
  if ((hits.get(tries) || 0) >= 10) return out(429, {error:'Too many wrong passwords. Try again in an hour.'});
  if (!same(req.headers.get('X-Admin-Key'), env.ADMIN_KEY)) { count(tries); return out(401, {error:'Wrong admin password.'}); }
  if (!env.CODES) return out(503, {error:'Bind a KV namespace named CODES to the worker first (Settings → Bindings).'});
  let b = {}; try { b = await req.json(); } catch {}
  const code = String(b.code || '').trim().toUpperCase();
  const all = async () => {
    const items = []; let cursor;
    do {
      const r = await env.CODES.list({prefix:'code:', cursor});
      for (const k of r.keys) items.push({code:k.name.slice(5), ...(k.metadata || {on:true})});
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
    return items.sort((x, y) => String(y.created || '').localeCompare(String(x.created || '')));
  };
  switch (b.action) {
    case 'list': return out(200, {codes:await all()});
    case 'add': {
      const name = String(b.name || '').trim().slice(0, 60);
      let c = code || newCode(name);
      if (!CODE_RE.test(c) || UUID.test(c)) return out(400, {error:'Codes are 4 to 40 letters, numbers and dashes.'});
      if (await env.CODES.get('code:' + c) != null) { if (code) return out(409, {error:'That code already exists.'}); c = newCode(name); }
      const meta = {name, on:true, created:new Date().toISOString(), last:''};
      await env.CODES.put('code:' + c, '1', {metadata:meta});
      codes.set(c, {meta, t:Date.now()});
      return out(200, {code:c, ...meta});
    }
    case 'set': {
      const r = await env.CODES.getWithMetadata('code:' + code);
      if (!r || r.value == null) return out(404, {error:'No such code.'});
      const meta = {...(r.metadata || {}), on:!!b.on, ...(typeof b.name === 'string' ? {name:b.name.trim().slice(0, 60)} : {})};
      await env.CODES.put('code:' + code, '1', {metadata:meta});
      codes.set(code, {meta, t:Date.now()});
      return out(200, {code, ...meta});
    }
    case 'delete': {
      await env.CODES.delete('code:' + code);
      codes.set(code, {meta:null, t:Date.now()});
      return out(200, {code, deleted:true});
    }
  }
  return out(400, {error:'Unknown action.'});
}

export default {
  async fetch(req, env, ctx, fetcher = fetch) {
    const url = new URL(req.url), path = url.pathname;
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const page = path.replace(/\/+$/, '').toLowerCase() || '/';
    // a browser opening the server: the bare address goes to the codes page, anything else says what this is
    if (req.method === 'GET' && page === '/') return Response.redirect(url.origin + '/admin', 302);
    if (req.method === 'GET' && page !== '/admin') return new Response(`Munchmark Plus server, version ${VERSION}. Your free-codes page is ${url.origin}/admin\n`,
      {status:404, headers:{'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store'}});
    if (page === '/admin' && req.method === 'GET') return new Response(ADMIN_HTML.replace('VERSION_TAG', VERSION), {headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store',
      'X-Frame-Options':'DENY', 'Referrer-Policy':'no-referrer', 'X-Robots-Tag':'noindex',
      'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"}});
    if (page === '/admin/api') return admin(req, env, ip);

    const origin = (req.headers.get('Origin') || '').replace(/\/+$/, '');
    const allowed = list(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).map(s => s.replace(/\/+$/, ''));
    const ok = allowed.includes(origin);
    const cors = {'Access-Control-Allow-Origin': ok ? origin : (allowed[0] || 'null'), 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Munchmark-License', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin'};
    const json = (code, body) => new Response(JSON.stringify(body), {status: code, headers: {...cors, 'Content-Type': 'application/json'}});
    const fail = (code, kind, message) => json(code, {error: {code, status: 'MACROLENS', macrolens: kind, message}});

    if (req.method === 'OPTIONS') return new Response(null, {status: ok ? 204 : 403, headers: cors});
    if (!ok) return fail(403, 'key', 'This server only answers the Munchmark app.');
    if (req.method !== 'POST') return fail(404, 'model', 'Not found.');

    if (count(`ip:${ip}:${Math.floor(Date.now() / 3600e3)}`) > (Number(env.HOURLY_LIMIT) || 40))
      return fail(429, 'rate', 'Lots of requests from this connection in the last hour. Try again later.');

    const lic = await checkLicense(req.headers.get('X-Munchmark-License'), env, fetcher);
    const why = {missing:'Gemini is part of Munchmark Plus. The free on-device recognizer still works.',
      unsold:'Munchmark Plus isn’t on sale yet, so this license can’t be checked.', down:'Couldn’t check your Plus license right now. Try again in a minute.',
      expired:'Your Munchmark Plus subscription has ended. Renew it to use Gemini again.', invalid:'That isn’t a valid Munchmark Plus license key or code.',
      'code-off':'That code is switched off right now. The on-device recognizer still works.'};
    const refuse = () => fail(lic.why === 'down' ? 503 : 402, lic.why === 'down' ? 'server' : 'plus', why[lic.why] || why.invalid);
    const daily = lic.kind === 'code' ? 0 : Number(env.DAILY_LIMIT) || 15;   // 0: no daily limit
    if (path === '/plus/check') { if (!lic.ok) return refuse(); touch(lic, env, ctx); return json(200, {ok:true, kind:lic.kind, plan:lic.plan, expires:lic.expires, daily}); }
    if (!lic.ok) return refuse();

    if (!env.GEMINI_KEY) return fail(500, 'key', 'The Munchmark Plus server has no GEMINI_KEY secret yet.');
    const country = (req.cf && req.cf.country) || req.headers.get('CF-IPCountry') || '';
    if (PAID_ONLY.has(country) && env.FREE_TIER !== 'no') return fail(451, 'region', 'Gemini isn’t available in your country yet. Everything else in the app still works.');
    const m = path.match(/^\/v1beta\/models\/([a-z0-9.\-]+):generateContent$/);
    if (!m) return fail(404, 'model', 'Not found.');
    if (!MODELS.has(m[1])) return fail(404, 'model', 'That model isn’t allowed on this server.');
    if (Number(req.headers.get('Content-Length') || 0) > MAX_BYTES) return fail(413, 'bad', 'That photo is too large.');

    // fair use for paid licenses: only answers that worked count toward the day's limit
    const used = `lic:${lic.id}:${day()}`;
    if (daily && (hits.get(used) || 0) >= daily)
      return fail(429, 'rate', `You’ve used today’s ${daily} Gemini requests. More tomorrow; the on-device recognizer still works.`);

    let r;
    try {
      r = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${m[1]}:generateContent`,
        {method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY}, body: req.body});
    } catch {
      return fail(502, 'server', 'The Munchmark Plus server couldn’t reach Gemini.');
    }
    if (r.ok) { if (daily) count(used); touch(lic, env, ctx); }
    const h = new Headers(cors);
    h.set('Content-Type', r.headers.get('Content-Type') || 'application/json');
    return new Response(r.body, {status: r.status, headers: h});
  },
};

const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Munchmark codes</title>
<style>
  :root{--bg:#F2F4EE;--surface:#FFFFFF;--surface-2:#E6EBE1;--ink:#16201A;--muted:#5B685F;--line:#D3DBCD;--accent:#2E7A4D;--on-accent:#FFFFFF;--danger:#A8322A}
  @media (prefers-color-scheme: dark){:root{--bg:#0F1311;--surface:#171C19;--surface-2:#212823;--ink:#E6ECE7;--muted:#97A39A;--line:#2B342E;--accent:#6CC491;--on-accent:#0F1311;--danger:#F2B8B5}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  main{max-width:640px;margin:0 auto;padding:20px 16px 56px}
  h1{font-size:23px;margin:4px 0 2px;letter-spacing:-.01em}
  h2{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 10px}
  .muted{color:var(--muted);font-size:14px;margin:0}
  .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;margin-top:14px}
  label{display:block;font-size:13px;font-weight:600;margin:0 0 6px}
  input[type=text],input[type=password]{width:100%;min-width:0;font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
  input:focus-visible,button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
  .fields{display:grid;gap:10px}
  button{font:inherit;font-size:15px;font-weight:650;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);padding:9px 14px;cursor:pointer}
  button.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
  button.sm{font-size:13.5px;padding:6px 11px}
  button.danger{color:var(--danger)}
  button.link{border:0;background:none;padding:0;color:var(--accent);font-size:14px}
  .msg{font-size:14px;margin:8px 0 0;min-height:1em}
  .msg.err{color:var(--danger)}
  ul{list-style:none;margin:0;padding:0}
  li.c{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:12px 0;border-top:1px solid var(--line)}
  li.c:first-child{border-top:0;padding-top:2px}
  .who{font-weight:650;overflow-wrap:anywhere}
  .code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;letter-spacing:.03em;overflow-wrap:anywhere}
  .meta{font-size:13px;color:var(--muted)}
  li.off .code{color:var(--muted);text-decoration:line-through}
  .acts{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
  .sw{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:650;color:var(--muted);cursor:pointer;align-self:start}
  .sw input{appearance:none;margin:0;flex:none;width:46px;height:27px;border-radius:999px;background:var(--surface-2);border:1px solid var(--line);position:relative;cursor:pointer;transition:background .2s}
  .sw input::after{content:"";position:absolute;top:2px;left:2px;width:21px;height:21px;border-radius:50%;background:var(--surface);box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .2s}
  .sw input:checked{background:var(--accent);border-color:var(--accent)}
  .sw input:checked::after{transform:translateX(19px)}
  .empty{color:var(--muted);font-size:14px;margin:0}
  .top{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
  [hidden]{display:none !important}
  @media (prefers-reduced-motion: reduce){.sw input,.sw input::after{transition:none}}
</style>
</head>
<body>
<main>
  <div class="top"><h1>Munchmark codes</h1><button type="button" class="link" id="out" hidden>Sign out</button></div>
  <p class="muted">Each code gives one person Gemini in the app for free, with no daily limit, until you switch it off. <span style="opacity:.7">Server VERSION_TAG.</span></p>

  <section class="card" id="login">
    <label for="key">Admin password</label>
    <div class="row"><input type="password" id="key" autocomplete="current-password" placeholder="The ADMIN_KEY you set in Cloudflare"><button type="button" class="primary" id="go">Open</button></div>
    <p class="msg" id="login-msg" role="status"></p>
  </section>

  <div id="app" hidden>
    <section class="card">
      <h2>New code</h2>
      <div class="fields">
        <div><label for="name">Who it's for</label><input type="text" id="name" maxlength="60" placeholder="Alex, or Mom, or @creatorname"></div>
        <div><label for="custom">Code <span class="meta">(optional, leave empty to make one)</span></label><input type="text" id="custom" maxlength="40" placeholder="ALEX-K7Q2M9" autocapitalize="characters" spellcheck="false"></div>
        <div><button type="button" class="primary" id="add">Make code</button></div>
      </div>
      <p class="msg" id="add-msg" role="status"></p>
    </section>
    <section class="card">
      <div class="top"><h2 id="count">Codes</h2><button type="button" class="link" id="refresh">Refresh</button></div>
      <ul id="list"></ul>
      <p class="msg" id="list-msg" role="status"></p>
    </section>
    <p class="muted" style="margin-top:14px">Switching a code off or on takes up to a minute or two to reach every phone. In the app, people paste the code in Body → Settings → Google Gemini.</p>
  </div>
</main>
<script>
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const when = iso => { if (!iso) return ''; const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}); };
  let KEY = ''; try { KEY = localStorage.getItem('munchmark-admin') || ''; } catch {}
  let codes = [], armed = '';
  async function api(action, data){
    const r = await fetch('/admin/api', {method:'POST', headers:{'Content-Type':'application/json', 'X-Admin-Key':KEY}, body:JSON.stringify(Object.assign({action}, data || {}))});
    let j = {}; try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(j.error || ('Error ' + r.status)); e.status = r.status; throw e; }
    return j;
  }
  function show(signedIn){ $('#login').hidden = signedIn; $('#app').hidden = !signedIn; $('#out').hidden = !signedIn; }
  function render(){
    const on = codes.filter(c => c.on !== false).length;
    $('#count').textContent = codes.length ? on + ' on · ' + (codes.length - on) + ' off' : 'Codes';
    $('#list').innerHTML = codes.length ? codes.map(c => {
      const off = c.on === false, id = esc(c.code);
      return '<li class="c' + (off ? ' off' : '') + '" data-code="' + id + '">' +
        '<div><div class="who">' + esc(c.name || 'No name') + '</div><div class="code">' + id + '</div>' +
        '<div class="meta">' + (c.created ? 'Made ' + when(c.created) : '') + (c.last ? ' · last used ' + when(c.last) : ' · not used yet') + '</div></div>' +
        '<label class="sw">' + (off ? 'Off' : 'On') + '<input type="checkbox" role="switch" data-act="toggle" ' + (off ? '' : 'checked') + ' aria-label="Code for ' + esc(c.name || c.code) + ' on"></label>' +
        '<div class="acts"><button type="button" class="sm" data-act="copy">Copy code</button><button type="button" class="sm" data-act="msg">Copy message</button>' +
        '<button type="button" class="sm danger" data-act="del">' + (armed === c.code ? 'Tap again to delete' : 'Delete') + '</button></div></li>';
    }).join('') : '<li><p class="empty">No codes yet. Make one above.</p></li>';
  }
  async function load(){
    $('#list-msg').textContent = '';
    try { codes = (await api('list')).codes || []; show(true); render(); return true; }
    catch (e) {
      if ([401, 429, 503].includes(e.status)) {
        if (e.status !== 503) { KEY = ''; try { localStorage.removeItem('munchmark-admin'); } catch {} }
        show(false); $('#login-msg').textContent = e.message; $('#login-msg').className = 'msg err'; return false;
      }
      $('#list-msg').textContent = e.message || 'Couldn’t reach the server.'; $('#list-msg').className = 'msg err'; return false;
    }
  }
  async function signIn(){
    KEY = $('#key').value.trim(); if (!KEY) { $('#key').focus(); return; }
    $('#login-msg').textContent = 'Checking…'; $('#login-msg').className = 'msg';
    if (await load()) { try { localStorage.setItem('munchmark-admin', KEY); } catch {} $('#key').value = ''; $('#login-msg').textContent = ''; }
  }
  async function copy(text, btn, label){
    try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
    catch { window.prompt('Copy this:', text); }
    setTimeout(() => { btn.textContent = label; }, 1500);
  }
  $('#go').addEventListener('click', signIn);
  $('#key').addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
  $('#out').addEventListener('click', () => { KEY = ''; try { localStorage.removeItem('munchmark-admin'); } catch {} codes = []; show(false); });
  $('#refresh').addEventListener('click', load);
  $('#add').addEventListener('click', async () => {
    const name = $('#name').value.trim(), code = $('#custom').value.trim(), m = $('#add-msg');
    if (!name && !code) { $('#name').focus(); m.textContent = 'Add a name so you know whose code it is.'; m.className = 'msg err'; return; }
    m.textContent = 'Making it…'; m.className = 'msg';
    try {
      const c = await api('add', {name, code});
      codes.unshift(c); render(); $('#name').value = ''; $('#custom').value = '';
      m.textContent = 'Made ' + c.code + (c.name ? ' for ' + c.name : '') + '. Use Copy message to send it.';
    } catch (e) { m.textContent = e.message; m.className = 'msg err'; }
  });
  $('#list').addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const li = b.closest('li'), code = li.dataset.code, c = codes.find(x => x.code === code); if (!c) return;
    if (b.dataset.act === 'copy') return copy(code, b, 'Copy code');
    if (b.dataset.act === 'msg') return copy('Here’s your Munchmark code: ' + code + '. In the app, open Body (top right) → Settings → Google Gemini, paste it and tap Activate.', b, 'Copy message');
    if (b.dataset.act === 'del') {
      if (armed !== code) { armed = code; render(); setTimeout(() => { if (armed === code) { armed = ''; render(); } }, 4000); return; }
      armed = '';
      try { await api('delete', {code}); codes = codes.filter(x => x.code !== code); render(); }
      catch (err) { $('#list-msg').textContent = err.message; $('#list-msg').className = 'msg err'; }
    }
  });
  $('#list').addEventListener('change', async e => {
    const t = e.target; if (t.dataset.act !== 'toggle') return;
    const code = t.closest('li').dataset.code, c = codes.find(x => x.code === code);
    try { const r = await api('set', {code, on:t.checked}); Object.assign(c, r); render(); }
    catch (err) { t.checked = !t.checked; $('#list-msg').textContent = err.message; $('#list-msg').className = 'msg err'; }
  });
  if (KEY) load(); else show(false);
})();
</script>
</body>
</html>`;
