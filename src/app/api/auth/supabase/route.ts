import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

export async function GET() {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Create a simple token for Supabase using jose
    const secret = new TextEncoder().encode(
      process.env.SUPABASE_JWT_SECRET ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const token = await new SignJWT({ sub: userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);

    return NextResponse.json({
      token,
      userId,
      authenticated: true,
    });
  } catch (error) {
    console.error('Error in auth exchange:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
