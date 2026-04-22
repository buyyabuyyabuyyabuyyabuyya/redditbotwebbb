import { authMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export default authMiddleware({
  signInUrl: '/sign-in',
  publicRoutes: [
    '/',
    '/pricing',
    '/api/webhooks/stripe',
    '/sign-in(.*)',
    '/sign-up(.*)',
  ],
  ignoredRoutes: ['/api/webhooks/stripe'],
  async afterAuth(auth, req) {
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
              req.cookies.set({ name, value, ...options });
              res.cookies.set({ name, value, ...options });
            },
            remove(name, options) {
              req.cookies.set({ name, value: '', ...options });
              res.cookies.set({ name, value: '', ...options });
            },
          },
        }
      );

      await supabase.auth.getUser();
      return res;
    }

    return NextResponse.next();
  },
});

export const config = {
  matcher: ['/((?!.+\\.[\\w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};
