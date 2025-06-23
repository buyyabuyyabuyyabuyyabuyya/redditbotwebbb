import { ClerkProvider } from '@clerk/nextjs';
import { Inter } from 'next/font/google';
import './globals.css';
import Navigation from '@/components/Navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
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
          <ErrorBoundary>
            <Navigation />
            <main className="min-h-screen bg-gray-900">{children}</main>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
