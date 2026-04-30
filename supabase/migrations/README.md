# Beno One Database Migrations

This directory contains the database migrations needed to implement the Beno One style discussion posting workflow.

## Migration Files

### 1. `20250101000000_add_beno_one_tables.sql`
**Main migration file** that creates:
- `products` table - Stores website data, AI descriptions, and customer segments
- `discussions` table - Tracks Reddit posts being monitored
- `discussion_replies` table - Stores generated replies and their status

### 2. `20250101000000_add_beno_one_tables_rollback.sql`
**Rollback file** to undo the migration if needed.

## How to Run

### Option 1: Using Supabase CLI
```bash
# Navigate to your project root
cd your-project-directory

# Run the migration
supabase db push

# Or run a specific migration
supabase migration up
```

### Option 2: Using Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the content of `20250101000000_add_beno_one_tables.sql`
4. Click "Run" to execute

### Option 3: Direct Database Connection
```bash
# Connect to your PostgreSQL database
psql "postgresql://username:password@host:port/database"

# Run the migration
\i supabase/migrations/20250101000000_add_beno_one_tables.sql
```

## What This Migration Does

### Tables Created

#### `products`
- Stores user's website information
- Contains AI-generated descriptions
- Holds customer segment selections
- Links to user account

#### `discussions`
- Tracks Reddit posts being monitored
- Stores relevance scores (1-10 scale)
- Links to products
- Tracks posting status

#### `discussion_replies`
- Stores generated replies to discussions
- Links to Reddit accounts used for posting
- Tracks posting status and errors
- Ensures one reply per account per discussion

### Security Features
- **Row Level Security (RLS)** enabled on all tables
- Users can only access their own data
- Proper foreign key constraints
- Cascade deletes for data integrity

### Performance Features
- Indexes on frequently queried columns
- Automatic `updated_at` timestamp updates
- Efficient querying for discussions and replies

## Verification

After running the migration, verify it worked by checking:

```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('products', 'discussions', 'discussion_replies');

-- Check if RLS is enabled
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('products', 'discussions', 'discussion_replies');

-- Check if indexes were created
SELECT indexname, tablename FROM pg_indexes 
WHERE tablename IN ('products', 'discussions', 'discussion_replies');
```

## Rollback

If you need to undo the migration:

```bash
# Using Supabase CLI
supabase db reset

# Or run the rollback file directly
psql "postgresql://username:password@host:port/database" -f supabase/migrations/20250101000000_add_beno_one_tables_rollback.sql
```

## Next Steps

After running this migration:
1. Update your existing `reddit_accounts` table to add the `is_discussion_poster` field
2. Create the API endpoints for website scraping and AI description generation
3. Build the frontend components for the Beno One workflow

## Notes

- This migration is designed to work with your existing Supabase setup
- All tables use UUID primary keys for consistency
- RLS policies ensure data security between users
- The migration is idempotent (safe to run multiple times) 