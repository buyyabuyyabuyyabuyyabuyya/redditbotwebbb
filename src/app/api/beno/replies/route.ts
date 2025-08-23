import { NextResponse } from 'next/server';

const PB_BASE = 'https://app.beno.one/pbsb/api';

// GET /api/beno/replies?productId=<id>
// Proxies the PocketBase collection "beno_replies" and returns submitted replies for the given product.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get('productId');
    if (!productId) {
      return NextResponse.json({ error: 'productId query param required' }, { status: 400 });
    }

    // Construct PocketBase query – latest 20 submitted replies for this product
    const pocketBaseUrl = `${PB_BASE}/collections/beno_replies/records` +
      `?page=0&perPage=20&sort=-created&filter=${encodeURIComponent(`product="${productId}" && status="submitted"`)}`;

    const res = await fetch(pocketBaseUrl, { next: { revalidate: 60 } });
    if (!res.ok) {
      return NextResponse.json({ error: `PocketBase request failed ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[beno replies route] error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
