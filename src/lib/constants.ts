// Recursiv project that owns Verify's storage. Set at deploy time.
export const PROJECT_ID = process.env.RECURSIV_PROJECT_ID || '';
// Verify persists to Recursiv object storage (not a Neon DB) to avoid the per-org DB cap.
export const BUCKET = process.env.VERIFY_BUCKET || 'verify';
export const SESSION_COOKIE = 'verify_session';
