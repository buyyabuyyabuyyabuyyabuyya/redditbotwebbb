import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Dashboard from '@/components/Dashboard';

export default async function DashboardPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=%2Fdashboard');
  }

  return (
    <div className="bg-[#f5f5ef]">
      <Dashboard />
    </div>
  );
}
