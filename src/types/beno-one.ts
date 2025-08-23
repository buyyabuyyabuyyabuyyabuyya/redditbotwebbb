// TypeScript types for Beno One style database tables
// These types match the database schema defined in the migration

export interface Product {
  id: string;
  user_id: string;
  name: string;
  url: string;
  scraped_content?: ScrapedWebsiteData | null;
  ai_description?: string | null;
  customer_segments?: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ScrapedWebsiteData {
  title?: string;
  meta_description?: string;
  meta_keywords?: string[];
  description?: string;
  main_content?: string;
  headings?: string[];
  links?: string[];
  images?: string[];
  social_media?: {
    twitter?: string;
    facebook?: string;
    linkedin?: string;
    instagram?: string;
    youtube?: string;
  };
  technologies?: string[];
  structured_data?: any; // JSON-LD structured data
  scraped_at: string;
}

export interface Discussion {
  id: string;
  product_id: string;
  subreddit: string;
  post_id: string;
  title?: string | null;
  content?: string | null;
  author?: string | null;
  relevance_score?: number | null; // 1-10 scale
  status: 'pending' | 'replied' | 'failed' | 'skipped';
  post_url?: string | null;
  post_created_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DiscussionReply {
  id: string;
  discussion_id: string;
  reddit_account_id: string;
  reply_content: string;
  reddit_comment_id?: string | null;
  status: 'pending' | 'posted' | 'failed' | 'removed';
  error_message?: string | null;
  posted_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerSegment {
  id: string;
  title: string;
  description: string;
  is_selected: boolean;
}

export interface ProductWithDiscussions extends Product {
  discussions?: Discussion[];
  discussion_count?: number;
  reply_count?: number;
}

export interface DiscussionWithReplies extends Discussion {
  replies?: DiscussionReply[];
  product?: Product;
}

export interface DiscussionReplyWithDetails extends DiscussionReply {
  discussion?: Discussion;
  reddit_account?: {
    id: string;
    username: string;
    is_validated: boolean;
  };
}

// API request/response types
export interface ScrapeWebsiteRequest {
  url: string;
}

export interface ScrapeWebsiteResponse {
  success: boolean;
  data?: ScrapedWebsiteData;
  error?: string;
}

export interface GenerateDescriptionRequest {
  scraped_content: ScrapedWebsiteData;
  product_name?: string;
}

export interface GenerateDescriptionResponse {
  success: boolean;
  description?: string;
  error?: string;
}

export interface GenerateCustomerSegmentsRequest {
  product_description: string;
  product_name?: string;
}

export interface GenerateCustomerSegmentsResponse {
  success: boolean;
  segments?: CustomerSegment[];
  error?: string;
}

export interface MonitorDiscussionsRequest {
  product_id: string;
  subreddits: string[];
  keywords?: string[];
}

export interface MonitorDiscussionsResponse {
  success: boolean;
  discussions_found?: number;
  error?: string;
}

// Status enums for better type safety
export enum DiscussionStatus {
  PENDING = 'pending',
  REPLIED = 'replied',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export enum ReplyStatus {
  PENDING = 'pending',
  POSTED = 'posted',
  FAILED = 'failed',
  REMOVED = 'removed'
}

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PROCESSING = 'processing'
} 