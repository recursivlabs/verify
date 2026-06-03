// Recursiv project that owns the Verify database. Set at deploy time.
export const PROJECT_ID = process.env.RECURSIV_PROJECT_ID || '';
export const DB_NAME = process.env.VERIFY_DB_NAME || 'verify';
export const SESSION_COOKIE = 'verify_session';
