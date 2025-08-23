import {
  DescribeProductRequest,
  DescribeProductResponse,
  CreateProductRequest,
  CreateProductResponse,
  GetDiscussionsResponse,
  PublishReplyRequest,
  PublishReplyResponse,
} from '../types/beno-workflow';

const SUPABASE_FN_BASE = 'https://scfwkrlxmglonmbvvkhz.supabase.co/functions/v1';
const BENO_API_BASE = 'https://beno.one/api';

function logRequest(method: string, url: string, body?: unknown) {
  // eslint-disable-next-line no-console
  console.log(`[benoService] ${method} → ${url}`, body ? `payload: ${JSON.stringify(body).slice(0, 300)}` : '');
}

export async function describeProduct(
  data: DescribeProductRequest,
): Promise<DescribeProductResponse> {
  const url = `${SUPABASE_FN_BASE}/products/describe-product`;
  logRequest('POST', url, data);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`describeProduct failed ${res.status}`);
  return res.json();
}

export async function createProduct(
  data: CreateProductRequest,
): Promise<CreateProductResponse> {
  const url = `${BENO_API_BASE}/product`;
  logRequest('POST', url, data);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`createProduct failed ${res.status}`);
  return res.json();
}

export async function getDiscussions(productId: string): Promise<GetDiscussionsResponse> {
  const url = `${BENO_API_BASE}/discussions?productId=${encodeURIComponent(productId)}`;
  logRequest('GET', url);
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`getDiscussions failed ${res.status}`);
  return res.json();
}

export async function publishReply(
  data: PublishReplyRequest,
): Promise<PublishReplyResponse> {
  const url = `${SUPABASE_FN_BASE}/comments/publish-by-3rd-party`;
  logRequest('POST', url, data);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`publishReply failed ${res.status}`);
  return res.json();
}
