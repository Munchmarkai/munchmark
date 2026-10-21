// Munchmark settings for everyone who opens this copy of the app.

// The Munchmark Plus server (the Cloudflare Worker in worker/gemini-proxy.js). Plus members' Gemini requests go
// through it; free users never touch it. Leave it empty to turn Plus off (each person can still add their own key).
export const GEMINI_PROXY = 'https://api.munchmarkai.app';

// The Lemon Squeezy checkout link for Plus, like 'https://munchmark.lemonsqueezy.com/buy/…'.
// While it's empty, the app says Plus is coming soon.
export const PLUS_CHECKOUT_URL = '';

// The price line shown next to the Gemini option.
export const PLUS_PRICE = '$1.99 a month or $12 a year';

// Gemini requests one Plus member may send per day (fair use). Keep it the same as DAILY_LIMIT on the server.
export const PLUS_DAILY_LIMIT = 15;
