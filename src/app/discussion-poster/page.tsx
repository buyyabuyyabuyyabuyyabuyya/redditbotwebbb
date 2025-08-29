import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import DiscussionPosterClient from '@/components/DiscussionPosterClient';

export default async function DiscussionPosterPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect('/sign-in');
  }

  return <DiscussionPosterClient />;
}
