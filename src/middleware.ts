import { authMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export default authMiddleware({
  // Public routes that don't require authentication
  publicRoutes: [
    '/',
    '/pricing',
    '/api/webhooks/stripe',
    '/sign-in(.*)',
    '/sign-up(.*)',
  ],
  ignoredRoutes: ['/api/webhooks/stripe'],
  async afterAuth(auth, req) {
    // If the user is authenticated with Clerk, verify in Supabase as well
    if (auth.userId) {
      const res = NextResponse.next();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            get(name) {
              return req.cookies.get(name)?.value;
            },
            set(name, value, options) {
              req.cookies.set({
                name,
                value,
                ...options,
              });
              res.cookies.set({
                name,
                value,
                ...options,
              });
            },
            remove(name, options) {
              req.cookies.set({
                name,
                value: '',
                ...options,
              });
              res.cookies.set({
                name,
                value: '',
                ...options,
              });
            },
          },
        }
      );

      // Get the Supabase user as required by the rules
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Create or update the user in Supabase if they don't exist yet
      if (!user) {
        // Here we could add logic to create the user in Supabase if needed
      }

      return res;
    }

    return NextResponse.next();
  },
});

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};
