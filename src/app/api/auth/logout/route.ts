import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/constants';

export async function POST(req: Request) {
  const url = new URL('/', req.url);
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return response;
}
