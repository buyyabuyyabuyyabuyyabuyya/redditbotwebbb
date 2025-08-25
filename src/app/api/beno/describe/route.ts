import { NextResponse } from 'next/server';
import { describeProduct } from '../../../../lib/benoService';
import { DescribeProductRequest } from '../../../../types/beno-workflow';

export async function POST(req: Request) {
  try {
    const body: DescribeProductRequest = await req.json();
    console.log('[describe route] incoming', body);
    const data = await describeProduct(body);
    console.log('[describe route] success', data);
    return NextResponse.json(data);
  } catch (error) {
    console.error('[describe route] error', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
//you are working on making it auto make the Responces 
