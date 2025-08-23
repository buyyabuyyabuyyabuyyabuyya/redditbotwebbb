import { NextResponse } from 'next/server';

const PB_BASE = 'https://app.beno.one/pbsb/api';

// GET /api/beno/promoting-product
// Returns list of promoting products records.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const urlParam = searchParams.get('url');
    const pbUrlBase = `${PB_BASE}/collections/beno_promoting_products/records`;

    let targetUrl: string;
    if (id) {
      targetUrl = `${pbUrlBase}/${id}`;
    } else if (urlParam) {
      // PocketBase filter by url exact match
      const filter = encodeURIComponent(`url="${urlParam}"`);
      targetUrl = `${pbUrlBase}?filter=${filter}&perPage=1`;
    } else {
      targetUrl = `${pbUrlBase}?sort=-created&perPage=50`;
    }

    const res = await fetch(targetUrl, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `PocketBase request failed ${res.status}: ${err.slice(0,200)}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[promoting-product route] GET error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// POST /api/beno/promoting-product
// Creates a promoting_products record in PocketBase.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, url, description } = body;

    if (!name || !url || !description) {
      return NextResponse.json({ error: 'name, url, description required' }, { status: 400 });
    }

    const payload = {
      name,
      url,
      description,
      validation_status: 'completed',
      // You can add more optional fields here if needed
    };

    const pbUrl = `${PB_BASE}/collections/beno_promoting_products/records`;
    const res = await fetch(pbUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `PocketBase request failed ${res.status}: ${err.slice(0,200)}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[promoting-product route] error', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
