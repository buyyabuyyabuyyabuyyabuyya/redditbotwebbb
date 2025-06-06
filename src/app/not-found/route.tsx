export const runtime = 'edge';

import Link from 'next/link';
import { Home } from 'lucide-react';
import { Button3D } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-2xl">
        <h1 className="text-6xl font-bold text-red-500">404</h1>
        <h2 className="text-3xl font-semibold">Page Not Found</h2>
        <p className="text-gray-300 text-lg">
          Oops! The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="pt-6">
          <Link href="/dashboard">
            <Button3D className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded-lg flex items-center gap-2">
              <Home className="w-5 h-5" />
              Back to Dashboard
            </Button3D>
          </Link>
        </div>
      </div>
    </div>
  );
}