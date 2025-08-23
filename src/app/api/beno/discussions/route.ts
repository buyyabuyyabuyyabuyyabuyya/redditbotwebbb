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
    console.log('[discussions route] fetched', { items: data.items.length });
    return NextResponse.json(data);
  } catch (error) {
    console.error('[discussions route] error', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
