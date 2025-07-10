import { ClerkProvider } from '@clerk/nextjs';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import Navigation from '@/components/Navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  manifest: '/manifest.json',
  themeColor: '#09090b',
  title: 'Reddit Bot Outreach Platform',
  description: 'Automate your Reddit outreach with our powerful bot platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider afterSignInUrl="/dashboard" afterSignUpUrl="/dashboard">
      <html lang="en">
        <body className={`${inter.className} bg-gray-950 text-white`}>
            {/* Register service worker for PWA */}
            <Script
              id="pwa-register"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `if ('serviceWorker' in navigator) {
                  window.addEventListener('load', () => {
                    navigator.serviceWorker.register('/sw.js');
                  });
                }`,
              }}
            />
          <ErrorBoundary>
            <Navigation />
            <main className="min-h-screen bg-gray-900">{children}</main>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
