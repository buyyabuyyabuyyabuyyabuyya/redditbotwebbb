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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://redditoutreach.com'
  ),
  manifest: '/manifest.json',
  title: 'RedditOutreach - Automate Your Reddit Comment Outreach',
  description:
    'Automate your Reddit comment outreach with AI-ranked discussion discovery, reusable templates, and server-managed auto-posters.',
  keywords: [
    'reddit bot',
    'reddit automation',
    'reddit outreach',
    'social media automation',
    'reddit marketing',
  ],
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
    apple: [{ url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://redditoutreach.com',
    title: 'RedditOutreach - Automate Your Reddit Comment Outreach',
    description:
      'Automate your Reddit comment outreach with AI-ranked discussion discovery, reusable templates, and server-managed auto-posters.',
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
    title: 'RedditOutreach - Automate Your Reddit Comment Outreach',
    description:
      'Automate your Reddit comment outreach with AI-ranked discussion discovery and auto-posters.',
    images: ['/icon-512x512.png'],
  },
};

export const viewport = {
  themeColor: '#f5f5ef',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/dashboard"
      afterSignUpUrl="/dashboard"
    >
      <html lang="en">
        <head>
          <link rel="icon" href="/favicon.ico" sizes="256x256" />
          <link
            rel="icon"
            href="/icon-192x192.png"
            sizes="192x192"
            type="image/png"
          />
          <link
            rel="icon"
            href="/icon-512x512.png"
            sizes="512x512"
            type="image/png"
          />
          <link rel="apple-touch-icon" href="/icon-192x192.png" />
          <meta name="theme-color" content="#f5f5ef" />
        </head>
        <body className={`${inter.className} bg-[#f5f5ef] text-zinc-950`}>
          <StructuredData />
          <Script
            id="pwa-register"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js'); }); }`,
            }}
          />
          <ErrorBoundary>
            <Navigation />
            <main className="min-h-screen bg-[#f5f5ef]">{children}</main>
            <Footer />
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
