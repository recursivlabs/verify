import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/constants';

// Origin of the auth server (strip the /api/v1 SDK suffix).
const AUTH_ORIGIN = (process.env.NEXT_PUBLIC_RECURSIV_URL || 'https://api.recursiv.io/api/v1').replace(/\/api\/v1\/?$/, '');

/**
 * Verify the OTP ourselves so we can capture better-auth's SIGNED session cookie.
 * The SDK's verifyOtp (0.5.x) returns the unsigned body token, which get-session
 * rejects — so we read the `better-auth.session_token` value from Set-Cookie instead.
 */
export async function POST(req: Request) {
  try {
    const { email, otp } = await req.json();
    if (!email || !otp) return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });

    const res = await fetch(`${AUTH_ORIGIN}/api/auth/sign-in/email-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: AUTH_ORIGIN },
      body: JSON.stringify({ email, otp }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = body?.error?.message || body?.message || 'Invalid or expired code';
      return NextResponse.json({ error: message }, { status: res.status === 401 || res.status === 403 ? 401 : 400 });
    }

    const data = await res.json().catch(() => ({} as any));
    const rawCookies =
      typeof (res.headers as any).getSetCookie === 'function'
        ? (res.headers as any).getSetCookie().join('; ')
        : res.headers.get('set-cookie') || '';
    const match = rawCookies.match(/better-auth\.session_token=([^;]+)/);
    const token = match ? match[1] : null;

    if (!token) {
      return NextResponse.json({ error: 'Signed in but no session cookie was issued' }, { status: 500 });
    }

    const response = NextResponse.json({
      success: true,
      user: data?.user ? { id: data.user.id, email: data.user.email, name: data.user.name } : null,
    });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
