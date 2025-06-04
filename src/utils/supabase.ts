import { createBrowserClient } from '@supabase/ssr'

// This file only contains the client-side supabase client to avoid importing next/headers
// which causes issues in the client components when used in pages directory

// Client-side Supabase client (safe for use in both server and client components)
export const createClientSupabaseClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
