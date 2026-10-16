// Shared Gemini server for everyone who opens this copy of the app (see "Share Gemini" in README.md).
// Paste your Cloudflare Worker address between the quotes, for example
//   export const GEMINI_PROXY = 'https://macro-lens-gemini.yourname.workers.dev';
// Leave it empty and each person adds their own free key in Body → Settings instead.
export const GEMINI_PROXY = 'macro-lens-gemini.athanbriggs.workers.dev';

// Gemini requests one phone may send through the shared server per day,
// so one person can't use up the free daily quota everyone shares.
export const SHARED_DAILY_LIMIT = 60;
