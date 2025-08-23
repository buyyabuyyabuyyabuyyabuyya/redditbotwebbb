import { NextResponse } from 'next/server';
import { publishReply } from '../../../../lib/benoService';
import { PublishReplyRequest } from '../../../../types/beno-workflow';

export async function POST(req: Request) {
  try {
    const body: PublishReplyRequest = await req.json();
    console.log('[reply route] incoming', body);
    const data = await publishReply(body);
    console.log('[reply route] success', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[reply route] error', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
