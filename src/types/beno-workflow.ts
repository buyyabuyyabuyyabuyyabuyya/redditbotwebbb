export interface DescribeProductRequest {
  url: string;
}

export interface DescribeProductResponse {
  name: string;
  description: string;
  customer_segments: string[];
  is_relevant: boolean;
}

export interface CreateProductRequest {
  name: string;
  description: string;
  product_url: string;
}

export interface CreateProductResponse {
  product_id: string;
  r_code: string;
}

// Structure trimmed to essential fields we actually consume
export interface DiscussionItem {
  raw_comment: unknown;
  engagement_metrics: unknown;
  relevance_score: number;
  comment: string;
}

export interface GetDiscussionsResponse {
  items: DiscussionItem[];
  [key: string]: unknown;
}

export interface PublishReplyRequest {
  user_id: string;
  pb_reply_id: string;
  comment_text: string;
  product_id: string;
  post_url: string;
}

export interface PublishReplyResponse {
  status: string;
  [key: string]: unknown;
}
