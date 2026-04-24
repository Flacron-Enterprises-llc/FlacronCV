'use client';
import React from 'react';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { useAuth, GOOGLE_ERROR_KEY } from '@/providers/AuthProvider';
import { auth } from '@/lib/firebase';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { toast } from 'sonner';

const PENDING_TEMPLATE_KEY = 'flacroncv_pending_template';

function getPostLoginRedirect(callbackUrl?: string | null): string {
  try {
    const raw = localStorage.getItem(PENDING_TEMPLATE_KEY);
    if (raw) {
      const { templateId, category } = JSON.parse(raw) as { templateId: string; category: string };
      localStorage.removeItem(PENDING_TEMPLATE_KEY);
      if (category === 'cover_letter') {
        return `/cover-letters/new?template=${templateId}`;
      }
      return `/cv/new?template=${templateId}`;
    }
  } catch {
    // ignore
  }
  if (callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
    return callbackUrl;
  }
  return '/dashboard';
}

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
  const redirectHandled = useRef(false);

  // Show Google auth error stored by redirect flow (e.g. account-exists error)
  useEffect(() => {
    const err = sessionStorage.getItem(GOOGLE_ERROR_KEY);
    if (err) {
      sessionStorage.removeItem(GOOGLE_ERROR_KEY);
      toast.error(err);
    }
  }, []);

  useEffect(() => {
    if (!loading && user && !redirectHandled.current) {
      redirectHandled.current = true;
      router.push(getPostLoginRedirect(callbackUrl));
    }
  }, [user, loading, router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setFormLoading(true);
    try {
      await register(email, password, name);
      redirectHandled.current = true;
      router.push('/verify-email');
    } catch (error) {
      toast.error((error as Error).message || 'Registration failed');
    } finally {
      setFormLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      await loginWithGoogle();
      if (auth?.currentUser) {
        redirectHandled.current = true;
        router.push(getPostLoginRedirect(callbackUrl));
      }
    } catch (error) {
      toast.error((error as Error).message || 'Google sign-in failed');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('register_title')}</h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('register_subtitle')}</p>

      <div className="mt-8">
        <Button variant="secondary" onClick={handleGoogle} className="w-full">
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
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
        <Input id="name" type="text" label={t('name')} value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" required />
        <Input id="email" type="email" label={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        <Input id="password" type="password" label={t('password')} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" hint="Minimum 8 characters" required />
        <Button type="submit" loading={formLoading} className="w-full" size="lg">
          {t('register_btn')}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-600 dark:text-stone-400">
        {t('have_account')}{' '}
        <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          {t('login_btn')}
        </Link>
      </p>
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
