import { SignIn, auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { redirect_url?: string };
}) {
  const { userId } = await auth();
  const redirectUrl = searchParams?.redirect_url || '/dashboard';

  if (userId) {
    redirect(redirectUrl);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 px-4 py-12">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        afterSignInUrl="/dashboard"
        redirectUrl={redirectUrl}
      />
    </div>
  );
}
