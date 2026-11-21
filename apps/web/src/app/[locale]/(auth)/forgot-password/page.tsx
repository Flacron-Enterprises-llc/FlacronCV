'use client';
import React from 'react';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { authErrorKey } from '@/lib/auth-errors';
import { useHydrated } from '@/hooks/useHydrated';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { AuthHeading, AuthMedallion, AUTH_PRIMARY_BTN } from '@/components/auth/AuthBits';
import { KeyRound, Mail, MailCheck } from 'lucide-react';
import { EmailSuggestion } from '@/components/auth/PasswordStrength';
import { suggestEmail } from '@/lib/auth-quality';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage(): React.JSX.Element | null {
  const t = useTranslations('auth');
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const suggestion = useMemo(() => suggestEmail(email), [email]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // No native GET submit (address in the URL) before React attaches the handler.
  const hydrated = useHydrated();

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
        <AuthHeading
          icon={<AuthMedallion tone="success"><MailCheck className="h-9 w-9" aria-hidden="true" /></AuthMedallion>}
          title={t('forgot_sent_title')}
          subtitle={t('forgot_sent_desc', { email })}
        />
        <Link href="/login" className="mt-8 inline-flex items-center gap-2 text-[15px] font-bold text-brand-700 hover:underline dark:text-brand-400">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t('back_to_login')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading
        icon={<AuthMedallion><KeyRound className="h-9 w-9" aria-hidden="true" /></AuthMedallion>}
        title={t('forgot_title')}
        subtitle={t('forgot_subtitle')}
      />

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <Input id="email" type="email" autoComplete="email" label={t('email')} icon={Mail} inputSize="lg" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" required />
        <div className="-mt-3">
          <EmailSuggestion suggestion={suggestion} onAccept={setEmail} />
        </div>
        <Button type="submit" loading={loading} disabled={!hydrated} className={AUTH_PRIMARY_BTN} size="lg">
          {t('reset_btn')}
        </Button>
      </form>

      <p className="mt-8 text-center">
        <Link href="/login" className="inline-flex items-center gap-2 text-[15px] font-bold text-brand-700 hover:underline dark:text-brand-400">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t('back_to_login')}
        </Link>
      </p>
    </div>
  );
}
