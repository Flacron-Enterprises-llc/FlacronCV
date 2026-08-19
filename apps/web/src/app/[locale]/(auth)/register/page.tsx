'use client';
import React from 'react';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { useAuth, GOOGLE_ERROR_KEY } from '@/providers/AuthProvider';
import { auth } from '@/lib/firebase';
import { getPostLoginRedirect } from '@/lib/post-auth-redirect';
import { currentUserRole } from '@/lib/current-user-role';
import { authErrorKey, isAccountExistsError, accountExistsEmail } from '@/lib/auth-errors';
import { recordAcceptanceAfterSignup } from '@/lib/legal-acceptance';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import GoogleIcon from '@/components/shared/GoogleIcon';
import LegalAcceptanceModal, { legalDocLinks } from '@/components/auth/LegalAcceptanceModal';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';

type PendingSignup = 'password' | 'google' | null;

function RegisterForm(): React.JSX.Element {
  const t = useTranslations('auth');
  const { register, loginWithGoogle, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalChecked, setLegalChecked] = useState(false);
  const [pendingSignup, setPendingSignup] = useState<PendingSignup>(null);
  const redirectHandled = useRef(false);
  const signupStarted = useRef(false);

  // Show Google auth error stored by a previous attempt (account-exists case)
  useEffect(() => {
    const stored = sessionStorage.getItem(GOOGLE_ERROR_KEY);
    if (stored) {
      sessionStorage.removeItem(GOOGLE_ERROR_KEY);
      try {
        const { email: storedEmail } = JSON.parse(stored) as { email: string };
        toast.error(t('account_exists_link', { email: storedEmail }));
      } catch {
        // Legacy/malformed payload — show nothing rather than raw text.
      }
    }
  }, [t]);

  useEffect(() => {
    if (loading) return;
    // Already signed in → bounce; do not count as signup_started (would inflate
    // the funnel denominator with people who never intended to register).
    if (user) {
      if (!redirectHandled.current) {
        redirectHandled.current = true;
        void currentUserRole().then((role) => router.push(getPostLoginRedirect(callbackUrl, role)));
      }
      return;
    }
    if (signupStarted.current) return;
    signupStarted.current = true;
    track('signup_started');
  }, [user, loading, router, callbackUrl]);

  const closeLegal = () => {
    setLegalOpen(false);
    setLegalChecked(false);
    setPendingSignup(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error(t('password_min'));
      return;
    }
    setPendingSignup('password');
    setLegalChecked(false);
    setLegalOpen(true);
  };

  const handleGoogle = () => {
    if (googleLoading || formLoading) return;
    setPendingSignup('google');
    setLegalChecked(false);
    setLegalOpen(true);
  };

  const completePasswordSignup = async () => {
    setFormLoading(true);
    try {
      await register(email, password, name);
      await recordAcceptanceAfterSignup();
      track('sign_up', { method: 'password' });
      redirectHandled.current = true;
      router.push('/verify-email');
    } catch (error) {
      toast.error(t(authErrorKey(error)));
    } finally {
      setFormLoading(false);
    }
  };

  const completeGoogleSignup = async () => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      if (auth?.currentUser) {
        await recordAcceptanceAfterSignup();
        track('sign_up', { method: 'google' });
        redirectHandled.current = true;
        router.push(getPostLoginRedirect(callbackUrl, await currentUserRole()));
      }
    } catch (error) {
      if (isAccountExistsError(error)) {
        toast.error(t('account_exists_link', { email: accountExistsEmail(error) }));
      } else {
        toast.error(t(authErrorKey(error)));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleLegalAccept = async () => {
    if (!legalChecked || !pendingSignup) return;
    const method = pendingSignup;
    closeLegal();
    if (method === 'password') await completePasswordSignup();
    else await completeGoogleSignup();
  };

  const signupBusy = formLoading || googleLoading;

  return (
    <div>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('register_title')}</h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('register_subtitle')}</p>

      <div className="mt-8">
        <Button variant="secondary" onClick={handleGoogle} loading={googleLoading} disabled={signupBusy} className="w-full">
          <GoogleIcon />
          {t('google')}
        </Button>
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-stone-200 dark:border-stone-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-4 text-stone-500 dark:bg-black dark:text-stone-400">
            {t('or_continue')}
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input id="name" type="text" autoComplete="name" label={t('name')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('name_placeholder')} required />
        <Input id="email" type="email" autoComplete="email" label={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        <Input id="password" type="password" autoComplete="new-password" label={t('password')} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" hint={t('password_hint')} required />
        <Button type="submit" loading={formLoading} disabled={googleLoading} className="w-full" size="lg">
          {t('register_btn')}
        </Button>
      </form>

      <p className="mt-3 text-center text-xs text-stone-500 dark:text-stone-400">
        {t.rich('legal_signup_line', legalDocLinks())}
      </p>

      <p className="mt-6 text-center text-sm text-stone-600 dark:text-stone-400">
        {t('have_account')}{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          {t('login_btn')}
        </Link>
      </p>

      <LegalAcceptanceModal
        isOpen={legalOpen}
        checked={legalChecked}
        onCheckedChange={setLegalChecked}
        onAccept={() => void handleLegalAccept()}
        onCancel={closeLegal}
        accepting={signupBusy}
      />
    </div>
  );
}

export default function RegisterPage(): React.JSX.Element {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
