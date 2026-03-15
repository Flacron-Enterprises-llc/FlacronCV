'use client';
import React from 'react';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { Mail, RefreshCw, LogOut } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function VerifyEmailPage(): React.JSX.Element | null {
  const { firebaseUser, emailVerified, logout, resendVerification, refreshEmailVerified } = useAuth();
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkVerification = useCallback(async () => {
    if (!firebaseUser) return;
    await refreshEmailVerified();
  }, [firebaseUser, refreshEmailVerified]);

  useEffect(() => {
    if (!firebaseUser) {
      router.push('/login');
      return;
    }
    if (emailVerified) {
      router.push('/dashboard');
      return;
    }

    // Poll every 4 seconds for verification
    const interval = setInterval(checkVerification, 4000);
    return () => clearInterval(interval);
  }, [firebaseUser, emailVerified, router, checkVerification]);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification();
      toast.success('Verification email sent! Check your inbox.');
    } catch {
      toast.error('Failed to send verification email. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    await checkVerification();
    setChecking(false);
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <div className="text-center">
      {/* Icon */}
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950">
        <Mail className="h-8 w-8 text-brand-600" />
      </div>

      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
        Check your inbox
      </h1>

      <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
        We sent a verification link to
      </p>
      <p className="mt-1 font-semibold text-stone-900 dark:text-white">
        {firebaseUser?.email}
      </p>

      <p className="mt-4 text-sm text-stone-500 dark:text-stone-500">
        Click the link in the email to verify your account. This page will redirect you automatically once verified.
      </p>

      <div className="mt-8 space-y-3">
        <Button
          onClick={handleCheckNow}
          loading={checking}
          className="w-full"
          size="lg"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          I've verified my email
        </Button>

        <Button
          variant="secondary"
          onClick={handleResend}
          loading={resending}
          className="w-full"
          size="lg"
        >
          Resend verification email
        </Button>
      </div>

      <button
        onClick={handleLogout}
        className="mt-6 flex w-full items-center justify-center gap-2 text-sm text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        <LogOut className="h-4 w-4" />
        Sign out and use a different account
      </button>
    </div>
  );
}
