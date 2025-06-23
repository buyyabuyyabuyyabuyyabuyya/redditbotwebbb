'use client';

import { useUser, UserButton, SignInButton, SignUpButton } from '@clerk/nextjs';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Navigation() {
  const { user, isLoaded } = useUser();
  const pathname = usePathname();
  const router = useRouter();

  // Redirect authenticated users away from auth pages
  useEffect(() => {
    if (
      isLoaded &&
      user &&
      (pathname === '/sign-in' || pathname === '/sign-up')
    ) {
      router.push('/dashboard');
    }
  }, [isLoaded, user, pathname, router]);

  const navItems = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Private Messages', href: '/messages' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'File Logs', href: '/file-logs' },
    { name: 'Tutorial', href: '/tutorial' },
    { name: 'Settings', href: '/settings' },
  ];

  const showNavItems = pathname !== '/' && pathname !== '/sign-in' && pathname !== '/sign-up';

  return (
    <nav className="bg-gray-900 shadow-lg border-b border-gray-700/50 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link
                href={user ? '/dashboard' : '/'}
                className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-red-400 hover:from-purple-400 hover:to-red-300 transition-all duration-300"
              >
                Reddit Bot
              </Link>
            </div>
            {showNavItems && (
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`${pathname === item.href
                      ? 'border-purple-400 text-purple-300'
                      : 'border-transparent text-gray-300 hover:border-purple-400 hover:text-purple-300'
                    } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors duration-200`}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            )}   {/* end nav items */}
          </div>
          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            {user ? (
              <div className="ml-3 relative flex items-center space-x-4">
                <span className="text-sm text-gray-300">
                  {user.emailAddresses[0]?.emailAddress}
                </span>
                <UserButton afterSignOutUrl="/" />
              </div>
            ) : (
              <div className="flex items-center space-x-4">
                <SignInButton mode="modal" afterSignInUrl="/dashboard">
                  <button className="text-gray-300 hover:text-purple-300 transition-colors duration-200 text-sm font-medium cursor-pointer">
                    Sign In
                  </button>
                </SignInButton>
                <SignUpButton mode="modal" afterSignUpUrl="/dashboard">
                  <button className="bg-gradient-to-r from-purple-500 to-red-500 hover:from-purple-600 hover:to-red-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 cursor-pointer">
                    Sign Up
                  </button>
                </SignUpButton>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="-mr-2 flex items-center sm:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none"
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
          {/* Mobile menu, show/hide based on menu state */}
          <div className="sm:hidden" id="mobile-menu">
            {showNavItems && (
            <div className="pt-2 pb-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${pathname === item.href ? 'bg-gray-800 text-purple-300' : 'text-gray-300 hover:bg-gray-700 hover:text-white'} block px-3 py-2 rounded-md text-base font-medium`}
                >
                  {item.name}
                </Link>
              ))}
              href={item.href}
              className={`${pathname === item.href ? 'bg-gray-800 text-purple-300' : 'text-gray-300 hover:bg-gray-700 hover:text-white'} block px-3 py-2 rounded-md text-base font-medium`}
            >
              {item.name}
            </Link>
          ))}
        </div>
        )}
        {!user && (
          <div className="pt-4 pb-3 border-t border-gray-700">
            <div className="flex items-center justify-around">
              <SignInButton mode="modal" afterSignInUrl="/dashboard">
                <button className="text-gray-300 hover:text-white block px-3 py-2 rounded-md text-base font-medium w-full text-left cursor-pointer">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal" afterSignUpUrl="/dashboard">
                <button className="bg-gradient-to-r from-purple-500 to-red-500 hover:from-purple-600 hover:to-red-600 text-white px-4 py-2 rounded-md text-base font-medium w-full text-center cursor-pointer">
                  Sign Up
                </button>
              </SignUpButton>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
