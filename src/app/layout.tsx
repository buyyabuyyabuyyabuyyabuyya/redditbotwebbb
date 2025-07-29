import { ClerkProvider } from '@clerk/nextjs';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import Navigation from '@/components/Navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import Footer from '@/components/Footer';
import StructuredData from '@/components/StructuredData';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  manifest: '/manifest.json',
  title: 'RedditOutreach - Automate Your Reddit Outreach',
  description: 'Automate your Reddit outreach with our powerful bot platform. Send personalized messages, target specific subreddits, and track your results.',
  keywords: ['reddit bot', 'reddit automation', 'reddit outreach', 'social media automation', 'reddit marketing'],
  authors: [{ name: 'RedditOutreach Team' }],
  creator: 'RedditOutreach',
  publisher: 'RedditOutreach',
  robots: 'index, follow',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '256x256', type: 'image/x-icon' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://redditoutreach.com',
    title: 'RedditOutreach - Automate Your Reddit Outreach',
    description: 'Automate your Reddit outreach with our powerful bot platform. Send personalized messages, target specific subreddits, and track your results.',
    siteName: 'RedditOutreach',
    images: [
      {
        url: '/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'RedditOutreach Logo',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RedditOutreach - Automate Your Reddit Outreach',
    description: 'Automate your Reddit outreach with our powerful bot platform.',
    images: ['/icon-512x512.png'],
  },
};

export const viewport = {
  themeColor: '#09090b',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider afterSignInUrl="/dashboard" afterSignUpUrl="/dashboard">
      <html lang="en">
        <head>
          <link rel="icon" href="/favicon.ico" sizes="256x256" />
          <link rel="icon" href="/icon-192x192.png" sizes="192x192" type="image/png" />
          <link rel="icon" href="/icon-512x512.png" sizes="512x512" type="image/png" />
          <link rel="apple-touch-icon" href="/icon-192x192.png" />
          <meta name="theme-color" content="#09090b" />
        </head>
        <body className={`${inter.className} bg-gray-950 text-white`}>
            <StructuredData />
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
            <Footer />
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
