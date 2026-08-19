'use client';
import React from 'react';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from '@/i18n/routing';
import { toast } from 'sonner';
import { Mail, RefreshCw, LogOut, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { getPostLoginRedirect } from '@/lib/post-auth-redirect';
import { currentUserRole } from '@/lib/current-user-role';
import { track } from '@/lib/analytics';

export default function VerifyEmailPage(): React.JSX.Element | null {
  const t = useTranslations('auth');
  const { firebaseUser, emailVerified, loading, logout, resendVerification, refreshEmailVerified } = useAuth();
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const verifiedTracked = useRef(false);

  const checkVerification = useCallback(async (): Promise<boolean> => {
    if (!firebaseUser) return false;
    return refreshEmailVerified();
  }, [firebaseUser, refreshEmailVerified]);

  /** Once per uid in this browser — not a server unique. See Batch L docs. */
  const trackEmailVerifiedOnce = useCallback((uid: string) => {
    if (verifiedTracked.current) return;
    verifiedTracked.current = true;
    const key = `flacroncv_email_verified_tracked:${uid}`;
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem(key) === '1') return;
      window.localStorage.setItem(key, '1');
    } catch {
      /* storage unavailable — still emit once this mount via the ref */
    }
    track('email_verified');
  }, []);

  useEffect(() => {
    // Wait for the auth state to settle before deciding where to send the
    // user — redirecting while it initializes caused a redirect loop
    // (/verify-email → /login → /dashboard → /verify-email) on refresh.
    if (loading) return;
    if (!firebaseUser) {
      router.push('/login');
      return;
    }
    if (emailVerified) {
      trackEmailVerifiedOnce(firebaseUser.uid);
      void currentUserRole().then((role) => router.push(getPostLoginRedirect(null, role)));
      return;
    }

    // Poll every 4 seconds for verification
    const interval = setInterval(() => {
      void checkVerification().catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [loading, firebaseUser, emailVerified, router, checkVerification, trackEmailVerifiedOnce]);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification();
      toast.success(t('verify_resent'));
    } catch {
      toast.error(t('verify_resend_failed'));
    } finally {
      setResending(false);
    }
  };

  const handleCheckNow = async () => {
    setChecking(true);
    try {
      const verified = await checkVerification();
      // On success the effect above redirects, so only the "not yet" case needs
      // surfacing — otherwise the button appears to do nothing. The 4s poll
      // deliberately does NOT toast; only this explicit click does.
      if (!verified) toast.error(t('verify_not_yet'));
    } catch {
      // A failed reload (offline / revoked token) is NOT the same as "unverified".
      toast.error(t('verify_check_failed'));
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      router.push('/login');
    } catch {
      toast.error(t('verify_signout_failed'));
      setLoggingOut(false);
    }
  };

  if (loading || !firebaseUser) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="text-center">
      {/* Icon */}
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 dark:bg-brand-950">
        <Mail className="h-8 w-8 text-brand-600" />
      </div>

      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
        {t('verify_title')}
      </h1>

      <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">
        {t('verify_sent_to')}
      </p>
      <p className="mt-1 break-all font-semibold text-stone-900 dark:text-white">
        {firebaseUser?.email}
      </p>

      <p className="mt-4 text-sm text-stone-500 dark:text-stone-500">
        {t('verify_desc')}
      </p>

      <div className="mt-8 space-y-3">
        <Button
          onClick={handleCheckNow}
          loading={checking}
          className="w-full"
          size="lg"
        >
          <RefreshCw className="me-2 h-4 w-4" />
          {t('verify_check_btn')}
        </Button>

        <Button
          variant="secondary"
          onClick={handleResend}
          loading={resending}
          className="w-full"
          size="lg"
        >
          {t('verify_resend_btn')}
        </Button>
      </div>

      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="mt-6 flex w-full items-center justify-center gap-2 text-sm text-stone-500 hover:text-stone-700 disabled:opacity-50 dark:text-stone-400 dark:hover:text-stone-200"
      >
        <LogOut className="h-4 w-4" />
        {t('verify_signout')}
      </button>
    </div>
  );
}
