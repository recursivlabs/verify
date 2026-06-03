import { cookies } from 'next/headers';
import { anonSdk } from './recursiv';
import { SESSION_COOKIE } from './constants';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/** Current user from the session cookie (server-side). Null if not signed in. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const session = await anonSdk.auth.getSession(token);
    if (!session?.user?.id) return null;
    return { id: session.user.id, name: session.user.name || '', email: session.user.email || '' };
  } catch {
    return null;
  }
}
