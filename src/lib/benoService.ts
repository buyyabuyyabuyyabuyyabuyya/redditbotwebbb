import {
  DescribeProductRequest,
  DescribeProductResponse,
  CreateProductRequest,
  CreateProductResponse,
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

// Removed getDiscussions - replaced with custom logic

// Removed publishReply function - replaced with custom Reddit posting logic

/**
 * Generate Reddit search queries based on product description and customer segments
 */
export function generateRedditSearchQueries(
  description: string,
  customerSegments: string[]
): string[] {
  const queries: string[] = [];
  
  // Extract key terms from description
  const descriptionWords = description.toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3)
    .slice(0, 5); // Take first 5 meaningful words
  
  // Generate queries combining description terms with customer segments
  customerSegments.forEach(segment => {
    const segmentWords = segment.toLowerCase().split(/\s+/);
    
    // Combine segment with description words
    descriptionWords.forEach(word => {
      queries.push(`${segment} ${word}`);
    });
    
    // Use segment alone
    queries.push(segment);
  });
  
  // Add description-based queries
  descriptionWords.forEach(word => {
    queries.push(word);
  });
  
  // Add some generic business queries if no specific segments
  if (customerSegments.length === 0) {
    queries.push('business help', 'startup advice', 'productivity tools');
  }
  
  // Remove duplicates and return top 10
  return Array.from(new Set(queries)).slice(0, 10);
}
