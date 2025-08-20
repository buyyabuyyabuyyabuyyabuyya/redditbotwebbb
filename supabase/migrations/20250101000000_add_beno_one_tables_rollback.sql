-- Rollback Migration: Remove Beno One style tables
-- Date: 2025-01-01
-- Description: Removes tables for products, discussions, and discussion replies

-- 1. Drop triggers first
DROP TRIGGER IF EXISTS update_discussion_replies_updated_at ON discussion_replies;
DROP TRIGGER IF EXISTS update_discussions_updated_at ON discussions;
DROP TRIGGER IF EXISTS update_products_updated_at ON products;

-- 2. Drop tables in reverse order (due to foreign key constraints)
DROP TABLE IF EXISTS discussion_replies;
DROP TABLE IF EXISTS discussions;
DROP TABLE IF EXISTS products;

-- 3. Drop the trigger function
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Note: This will permanently delete all data in these tables
-- Make sure to backup any important data before running this rollback 