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
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import GoogleIcon from '@/components/shared/GoogleIcon';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';

function LoginForm(): React.JSX.Element {
  const t = useTranslations('auth');
  const { login, loginWithGoogle, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const redirectHandled = useRef(false);

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

  // Redirect once auth state settles (covers Google popup and page-reload cases)
  useEffect(() => {
    if (!loading && user && !redirectHandled.current) {
      redirectHandled.current = true;
      void currentUserRole().then((role) => router.push(getPostLoginRedirect(callbackUrl, role)));
    }
  }, [user, loading, router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    try {
      await login(email, password);
      track('sign_in', { method: 'password' });
      // login() sets loading=true; the useEffect above will redirect once
      // onAuthStateChanged resolves and sets user. Setting the ref here
      // prevents a double-redirect if the effect fires before navigation.
      redirectHandled.current = true;
      router.push(getPostLoginRedirect(callbackUrl, await currentUserRole()));
    } catch (error) {
      toast.error(t(authErrorKey(error)));
    } finally {
      setFormLoading(false);
    }
  };

  const handleGoogle = async () => {
    if (googleLoading) return;
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      // Only redirect if Firebase actually signed us in (popup not dismissed)
      if (auth?.currentUser) {
        track('sign_in', { method: 'google' });
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('login_title')}</h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('login_subtitle')}</p>

      {/* Social auth */}
      <div className="mt-8">
        <Button variant="secondary" onClick={handleGoogle} loading={googleLoading} disabled={googleLoading || formLoading} className="w-full">
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
        <Input
          id="email"
          type="email"
          autoComplete="email"
          label={t('email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
        <div>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            label={t('password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <div className="mt-1 text-end">
            <Link href="/forgot-password" className="text-xs text-brand-600 hover:text-brand-700">
              {t('forgot_password')}
            </Link>
          </div>
        </div>
        <Button type="submit" loading={formLoading} disabled={googleLoading} className="w-full" size="lg">
          {t('login_btn')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600 dark:text-stone-400">
        {t('no_account')}{' '}
        <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
          {t('register_btn')}
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage(): React.JSX.Element {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
