import { SignUp, auth } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

export default async function SignUpPage({
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
      <SignUp
        path="/sign-up"
        routing="path"
        signInUrl="/sign-in"
        afterSignUpUrl="/dashboard"
        redirectUrl={redirectUrl}
      />
    </div>
  );
}
