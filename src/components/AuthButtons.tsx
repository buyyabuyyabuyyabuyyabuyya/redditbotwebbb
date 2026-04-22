'use client';

import { SignUpButton } from '@clerk/nextjs';
import Link from 'next/link';
import { Button3D, RippleButton } from './ui/Button';
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
        <Button3D className="w-full">Get started</Button3D>
      </SignUpButton>
    );
  }

  return (
    <div className="flex items-center justify-center gap-x-6">
      <SignUpButton
        mode="modal"
        afterSignUpUrl="/dashboard"
        redirectUrl={redirectUrl}
      >
        <Button3D>Get started</Button3D>
      </SignUpButton>
      <Link href="#pricing">
        <RippleButton variant="secondary">View pricing</RippleButton>
      </Link>
    </div>
  );
}
