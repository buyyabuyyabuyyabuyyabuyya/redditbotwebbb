'use client';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';

export default function Footer() {
  const { isSignedIn } = useUser();
  const safe = (path: string) => (isSignedIn ? path : '/');
  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="col-span-1 md:col-span-2">
            <h3 className="text-lg font-semibold mb-4">RedditOutreach</h3>
            <p className="text-gray-400 mb-4">
              Automate your Reddit outreach with intelligent bot services. 
              Scan subreddits, analyze content with AI, and send targeted messages efficiently.
            </p>
            <p className="text-gray-400 text-sm">
              {new Date().getFullYear()} RedditOutreach. All rights reserved.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-md font-semibold mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/" className="text-gray-400 hover:text-white transition-colors">
                  Home
                </Link>
              </li>
              
                <li>
                  <Link href={safe('/pricing')} className="text-gray-400 hover:text-white transition-colors">
                        Pricing
                      </Link>
                    </li>
                    <li>
                      <Link href={safe('/tutorial')} className="text-gray-400 hover:text-white transition-colors">
                        Tutorial
                      </Link>
                    </li>
                    <li>
                      <Link href={safe('/dashboard')} className="text-gray-400 hover:text-white transition-colors">
                        Dashboard
                      </Link>
                    </li>
                
              
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-md font-semibold mb-4">Legal</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/privacy" className="text-gray-400 hover:text-white transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-gray-400 hover:text-white transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <a 
                  href="https://www.reddit.com/wiki/api-terms" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  Reddit API Terms
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-8 pt-8 border-t border-gray-800">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400 text-sm">
              
            </p>
            <div className="flex space-x-6 mt-4 md:mt-0">
              <Link 
                href="/privacy" 
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                Privacy
              </Link>
              <Link 
                href="/terms" 
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                Terms
              </Link>
              <a 
                href="mailto:buyyav20@gmail.com" 
                className="text-gray-400 hover:text-white text-sm transition-colors"
              >
                Support
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
