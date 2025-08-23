import { NextResponse } from 'next/server';
import { getDiscussions } from '../../../../lib/benoService';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    if (!productId) {
      return NextResponse.json({ error: 'productId query param required' }, { status: 400 });
    }
    console.log('[discussions route] productId', productId);
    const data = await getDiscussions(productId);
    const safeItems = Array.isArray((data as any).items) ? (data as any).items : [];
    console.log('[discussions route] fetched', { count: safeItems.length });
    return NextResponse.json({ ...data, items: safeItems });
  } catch (error) {
    console.error('[discussions route] error', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}