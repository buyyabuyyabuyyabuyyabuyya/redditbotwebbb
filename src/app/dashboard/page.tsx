import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Dashboard from '@/components/Dashboard';

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=%2Fdashboard');
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 px-4 py-8 sm:px-6 lg:px-8">
      <Dashboard />
    </div>
  );
}
