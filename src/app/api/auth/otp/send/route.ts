import { NextResponse } from 'next/server';
import { anonSdk } from '@/lib/recursiv';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    await anonSdk.auth.sendOtp({ email });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send code';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
