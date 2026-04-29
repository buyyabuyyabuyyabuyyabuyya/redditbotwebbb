'use client';

import { useUser, UserButton, SignInButton, SignUpButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthRedirectUrl } from '../hooks/useAuthRedirectUrl';

export default function Navigation() {
  const { user } = useUser();
  const pathname = usePathname();
  const redirectUrl = useAuthRedirectUrl();

  const navItems = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Discussion Poster', href: '/discussion-poster' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'File Logs', href: '/file-logs' },
    { name: 'Tutorial', href: '/tutorial' },
    { name: 'Settings', href: '/settings' },
  ];

  const showNavItems =
    pathname !== '/' && pathname !== '/sign-in' && pathname !== '/sign-up';

  return (
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/90 backdrop-blur-xl">
      <div className="section-shell">
        <div className="flex h-16 items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <Link
              href={user ? '/dashboard' : '/'}
              className="text-lg font-semibold tracking-tight text-zinc-50"
            >
              RedditOutreach
            </Link>
            {showNavItems && (
              <div className="hidden items-center gap-6 md:flex">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-sm font-medium transition-colors ${pathname === item.href ? 'text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'}`}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden text-sm text-zinc-400 md:block">
                  {user.emailAddresses[0]?.emailAddress}
                </span>
                <UserButton afterSignOutUrl="/" />
              </>
            ) : (
              <>
                <SignInButton
                  mode="modal"
                  afterSignInUrl="/dashboard"
                  redirectUrl={redirectUrl}
                >
                  <button className="ui-button-secondary">Sign in</button>
                </SignInButton>
                <SignUpButton
                  mode="modal"
                  afterSignUpUrl="/dashboard"
                  redirectUrl={redirectUrl}
                >
                  <button className="ui-button-primary">Get started</button>
                </SignUpButton>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
