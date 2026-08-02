'use client';
import React from 'react';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { authErrorKey } from '@/lib/auth-errors';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage(): React.JSX.Element | null {
  const t = useTranslations('auth');
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(email);
      // The API responds identically whether or not the account exists, and
      // this screen mirrors that so account existence never leaks.
      setSent(true);
    } catch (error) {
      toast.error(t(authErrorKey(error)));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-stone-900 dark:text-white">{t('forgot_sent_title')}</h2>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
          {t('forgot_sent_desc', { email })}
        </p>
        <Link href="/login" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" />
          {t('back_to_login')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('forgot_title')}</h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('forgot_subtitle')}</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Input id="email" type="email" autoComplete="email" label={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        <Button type="submit" loading={loading} className="w-full" size="lg">
          {t('reset_btn')}
        </Button>
      </form>

      <p className="mt-6 text-center">
        <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" />
          {t('back_to_login')}
        </Link>
      </p>
    </div>
  );
}
