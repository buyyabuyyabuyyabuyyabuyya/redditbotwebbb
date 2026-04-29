import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import DiscussionPosterClient from '@/components/DiscussionPosterClient';

export default async function DiscussionPosterPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in?redirect_url=%2Fdiscussion-poster');
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <DiscussionPosterClient />
    </div>
  );
}
