'use client';

import { SignUpButton } from '@clerk/nextjs';
import Link from 'next/link';
import { Button3D, RippleButton } from './ui/Button';

interface AuthButtonsProps {
  pricing?: boolean;
}

export default function AuthButtons({ pricing = false }: AuthButtonsProps) {
  if (pricing) {
    // Button for pricing section
    return (
      <SignUpButton mode="modal" redirectUrl="/dashboard">
        <Button3D className="w-full">Get started</Button3D>
      </SignUpButton>
    );
  }

  // Default buttons for hero section
  return (
    <div className="flex items-center justify-center gap-x-6">
      <SignUpButton mode="modal" redirectUrl="/dashboard">
        <Button3D>Get started</Button3D>
      </SignUpButton>
      <Link href="/pricing">
        <RippleButton variant="secondary">View pricing</RippleButton>
      </Link>
    </div>
  );
}
