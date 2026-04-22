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
    <nav className="relative z-50 border-b border-gray-700/50 bg-gray-900 shadow-lg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex flex-shrink-0 items-center">
              <Link
                href={user ? '/dashboard' : '/'}
                className="bg-gradient-to-r from-purple-500 to-red-400 bg-clip-text text-xl font-bold text-transparent transition-all duration-300 hover:from-purple-400 hover:to-red-300"
              >
                RedditOutreach
              </Link>
            </div>
            {showNavItems && (
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${
                      pathname === item.href
                        ? 'border-purple-400 text-purple-300'
                        : 'border-transparent text-gray-300 hover:border-purple-400 hover:text-purple-300'
                    } inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium transition-colors duration-200`}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            {user ? (
              <div className="relative ml-3 flex items-center space-x-4">
                <span className="text-sm text-gray-300">
                  {user.emailAddresses[0]?.emailAddress}
                </span>
                <UserButton afterSignOutUrl="/" />
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <SignInButton
                  mode="modal"
                  afterSignInUrl="/dashboard"
                  redirectUrl={redirectUrl}
                >
                  <button className="cursor-pointer text-sm font-medium text-gray-300 transition-colors duration-200 hover:text-purple-300">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton
                  mode="modal"
                  afterSignUpUrl="/dashboard"
                  redirectUrl={redirectUrl}
                >
                  <button className="cursor-pointer rounded-md bg-gradient-to-r from-purple-500 to-red-500 px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:from-purple-600 hover:to-red-600">
                    Sign Up
                  </button>
                </SignUpButton>
              </div>
            )}
          </div>

          <div className="-mr-2 flex items-center sm:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none"
              aria-controls="mobile-menu"
              aria-expanded="false"
            >
              <span className="sr-only">Open main menu</span>
              <svg
                className="block h-6 w-6"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="sm:hidden" id="mobile-menu">
            {showNavItems && (
              <div className="space-y-1 pt-2 pb-3">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${
                      pathname === item.href
                        ? 'bg-gray-800 text-purple-300'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                    } block rounded-md px-3 py-2 text-base font-medium`}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
            {user ? (
              <div className="space-y-1 pt-2 pb-3">
                <UserButton afterSignOutUrl="/" />
              </div>
            ) : (
              <div className="space-y-1 pt-2 pb-3">
                <SignInButton
                  mode="modal"
                  afterSignInUrl="/dashboard"
                  redirectUrl={redirectUrl}
                >
                  <button className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-base font-medium text-gray-300 hover:text-white">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton
                  mode="modal"
                  afterSignUpUrl="/dashboard"
                  redirectUrl={redirectUrl}
                >
                  <button className="w-full cursor-pointer rounded-md bg-gradient-to-r from-purple-500 to-red-500 px-4 py-2 text-center text-base font-medium text-white hover:from-purple-600 hover:to-red-600">
                    Sign Up
                  </button>
                </SignUpButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
