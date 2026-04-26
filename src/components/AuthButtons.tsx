'use client';

import { SignUpButton } from '@clerk/nextjs';
import Link from 'next/link';
import { useAuthRedirectUrl } from '../hooks/useAuthRedirectUrl';

interface AuthButtonsProps {
  pricing?: boolean;
}

export default function AuthButtons({ pricing = false }: AuthButtonsProps) {
  const redirectUrl = useAuthRedirectUrl();

  if (pricing) {
    return (
      <SignUpButton
        mode="modal"
        afterSignUpUrl="/dashboard"
        redirectUrl={redirectUrl}
      >
        <button className="ui-button-primary w-full">Get started</button>
      </SignUpButton>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <SignUpButton
        mode="modal"
        afterSignUpUrl="/dashboard"
        redirectUrl={redirectUrl}
      >
        <button className="ui-button-primary">Get started</button>
      </SignUpButton>
      <Link href="#pricing" className="ui-button-secondary">
        View pricing
      </Link>
    </div>
  );
}
