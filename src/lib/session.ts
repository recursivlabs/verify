import { cookies } from 'next/headers';
import { SESSION_COOKIE } from './constants';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

// Origin of the auth server (strip the /api/v1 SDK suffix).
const AUTH_ORIGIN = (process.env.NEXT_PUBLIC_RECURSIV_URL || 'https://api.recursiv.io/api/v1').replace(/\/api\/v1\/?$/, '');

/**
 * Validate a session token against better-auth's get-session.
 * The platform sets secure cookies, so the real cookie name is
 * `__Secure-better-auth.session_token`. The SDK's getSession sends the plain
 * name and fails — so we call get-session directly under both names.
 */
async function fetchSession(tokenValue: string): Promise<{ id: string; name?: string; email?: string } | null> {
  try {
    const res = await fetch(`${AUTH_ORIGIN}/api/auth/get-session`, {
      headers: {
        Cookie: `__Secure-better-auth.session_token=${tokenValue}; better-auth.session_token=${tokenValue}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.user?.id ? data.user : null;
  } catch {
    return null;
  }
}

/** Current user from the session cookie (server-side). Null if not signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await fetchSession(token);
  if (!user) return null;
  return { id: user.id, name: user.name || '', email: user.email || '' };
}
