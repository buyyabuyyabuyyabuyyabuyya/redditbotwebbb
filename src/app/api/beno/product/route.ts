import { NextResponse } from 'next/server';
import { createProduct } from '../../../../lib/benoService';
import { CreateProductRequest } from '../../../../types/beno-workflow';

export async function POST(req: Request) {
  try {
    const body: CreateProductRequest = await req.json();
    console.log('[product route] incoming', body);
    const data = await createProduct(body);
    console.log('[product route] success', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[product route] error', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
