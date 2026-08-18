'use client';
import React from 'react';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from '@/i18n/routing';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { Mail, Phone, MapPin, CheckCircle, Send, AlertCircle } from 'lucide-react';

type Translate = ReturnType<typeof useTranslations>;

function categoryLabels(t: Translate) {
  return {
    general_question: t('cat_general_question'),
    account_support: t('cat_account_support'),
    login_password: t('cat_login_password'),
    technical_support: t('cat_technical_support'),
    free_plan: t('cat_free_plan'),
    pro_plan: t('cat_pro_plan'),
    enterprise_plan: t('cat_enterprise_plan'),
    billing_subscription: t('cat_billing_subscription'),
    trial: t('cat_trial'),
    cancellation: t('cat_cancellation'),
    refund_request: t('cat_refund_request'),
    cv_builder: t('cat_cv_builder'),
    cover_letter_builder: t('cat_cover_letter_builder'),
    ats_optimization: t('cat_ats_optimization'),
    ats_score: t('cat_ats_score'),
    ai_writing_assistant: t('cat_ai_writing_assistant'),
    templates: t('cat_templates'),
    export_problem: t('cat_export_problem'),
    job_tracker: t('cat_job_tracker'),
    feature_request: t('cat_feature_request'),
    partnership: t('cat_partnership'),
    business_enterprise: t('cat_business_enterprise'),
    media_inquiry: t('cat_media_inquiry'),
    privacy_request: t('cat_privacy_request'),
    legal_inquiry: t('cat_legal_inquiry'),
    security_concern: t('cat_security_concern'),
    other: t('cat_other'),
  } as const;
}

type Category = keyof ReturnType<typeof categoryLabels>;

export default function ContactUsPage(): React.JSX.Element | null {
  const t = useTranslations('contact');
  const router = useRouter();
  const labels = categoryLabels(t);
  const { user, firebaseUser, degraded, placeholderAccount } = useAuth();

  const [form, setForm] = useState({
    name: '',
    email: '',
    category: 'general_question' as Category,
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFailed(false);
    const categoryLabel = labels[form.category];
    try {
      await api.post('/contact', {
        name: form.name.trim(),
        email: form.email.trim(),
        subject: categoryLabel,
        category: form.category,
        message: form.message.trim(),
        accountEmail: user?.email || firebaseUser?.email || undefined,
        plan:
          !degraded && !placeholderAccount && user?.subscription?.plan
            ? user.subscription.plan
            : undefined,
        userId: firebaseUser?.uid || user?.uid || undefined,
        timestamp: new Date().toISOString(),
      });
      setSent(true);
      toast.success(t('success_title'));
    } catch (err) {
      setFailed(true);
      toast.error((err as Error)?.message || t('error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="border-b border-stone-200 bg-gradient-to-b from-stone-50 to-white dark:border-stone-800 dark:from-stone-900 dark:to-black">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-stone-600 dark:text-stone-400">
            {t('subtitle')}
          </p>
          <p className="mx-auto mt-6 max-w-2xl text-base text-stone-600 dark:text-stone-400">
            {t('intro')}
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-base text-stone-600 dark:text-stone-400">
            {t('intro_cta')}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-5">
          <div className="space-y-6 lg:col-span-2">
            <h2 className="text-xl font-bold text-stone-900 dark:text-white">{t('info_title')}</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">{t('operated_by')}</p>

            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-stone-900 dark:text-white">{t('address_label')}</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('address')}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                <Phone className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-stone-900 dark:text-white">{t('phone_label')}</p>
                <a
                  href="tel:+19299901182"
                  className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  {t('phone')}
                </a>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-stone-900 dark:text-white">{t('email_label')}</p>
                <a
                  href={`mailto:${t('info_email')}`}
                  className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  {t('info_email')}
                </a>
              </div>
            </div>

            <div>
              <p className="font-medium text-stone-900 dark:text-white">{t('parent_label')}</p>
              <p className="text-sm text-stone-500 dark:text-stone-400">{t('parent_name')}</p>
              <p className="mt-2 text-sm font-medium text-stone-900 dark:text-white">
                {t('parent_email_label')}
              </p>
              <a
                href={`mailto:${t('parent_email')}`}
                className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                {t('parent_email')}
              </a>
            </div>
          </div>

          <div className="lg:col-span-3">
            {sent ? (
              <Card className="flex flex-col items-center py-16 text-center">
                <CheckCircle className="h-16 w-16 text-emerald-500" />
                <h3 className="mt-4 text-xl font-bold text-stone-900 dark:text-white">
                  {t('success_title')}
                </h3>
                <p className="mt-2 text-stone-500 dark:text-stone-400">{t('success_thanks')}</p>
                <p className="mt-2 text-stone-500 dark:text-stone-400">{t('success_desc')}</p>
                <p className="mt-2 text-stone-500 dark:text-stone-400">{t('success_reply')}</p>
                <Button variant="secondary" className="mt-6" onClick={() => router.push('/')}>
                  {t('success_home')}
                </Button>
              </Card>
            ) : failed ? (
              <Card className="flex flex-col items-center py-16 text-center">
                <AlertCircle className="h-16 w-16 text-red-500" />
                <h3 className="mt-4 text-xl font-bold text-stone-900 dark:text-white">
                  {t('error_title')}
                </h3>
                <p className="mt-2 text-stone-500 dark:text-stone-400">{t('error')}</p>
                <p className="mt-2 text-stone-500 dark:text-stone-400">{t('error_retry')}</p>
                <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">{t('error_contact')}</p>
                <a
                  href={`mailto:${t('info_email')}`}
                  className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  {t('info_email')}
                </a>
                <Button variant="secondary" className="mt-6" onClick={() => setFailed(false)}>
                  {t('error_retry')}
                </Button>
              </Card>
            ) : (
              <Card>
                <h2 className="mb-6 text-xl font-bold text-stone-900 dark:text-white">
                  {t('form_title')}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="name"
                      name="name"
                      label={t('name')}
                      value={form.name}
                      onChange={handleChange}
                      placeholder={t('name_placeholder')}
                      required
                    />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      label={t('email')}
                      value={form.email}
                      onChange={handleChange}
                      placeholder={t('email_placeholder')}
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="category"
                      className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300"
                    >
                      {t('category_label')}
                    </label>
                    <select
                      id="category"
                      name="category"
                      value={form.category}
                      onChange={handleChange}
                      className="input-field"
                    >
                      {(Object.keys(labels) as Category[]).map((c) => (
                        <option key={c} value={c}>
                          {labels[c]}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="message"
                      className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300"
                    >
                      {t('message')}
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      value={form.message}
                      onChange={handleChange}
                      placeholder={t('message_placeholder')}
                      rows={5}
                      required
                      className="input-field resize-none"
                    />
                  </div>

                  <Button
                    type="submit"
                    loading={loading}
                    className="w-full"
                    size="lg"
                    icon={<Send className="h-4 w-4" />}
                  >
                    {loading ? t('sending') : t('send')}
                  </Button>
                </form>
              </Card>
            )}
          </div>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-3">
          <section>
            <h2 className="text-lg font-bold text-stone-900 dark:text-white">{t('billing_title')}</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('billing_intro')}</p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-stone-600 dark:text-stone-400">
              <li>{t('billing_1')}</li>
              <li>{t('billing_2')}</li>
              <li>{t('billing_3')}</li>
              <li>{t('billing_4')}</li>
              <li>{t('billing_5')}</li>
            </ul>
            <p className="mt-3 text-sm font-semibold text-stone-900 dark:text-white">
              {t('billing_important')}
            </p>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{t('billing_never')}</p>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('billing_send')}</p>
            <a
              href={`mailto:${t('info_email')}`}
              className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              {t('info_email')}
            </a>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900 dark:text-white">{t('privacy_title')}</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('privacy_intro')}</p>
            <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-stone-600 dark:text-stone-400">
              <li>{t('privacy_1')}</li>
              <li>{t('privacy_2')}</li>
              <li>{t('privacy_3')}</li>
              <li>{t('privacy_4')}</li>
              <li>{t('privacy_5')}</li>
              <li>{t('privacy_6')}</li>
              <li>{t('privacy_7')}</li>
            </ul>
            <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">{t('privacy_select')}</p>
            <p className="text-sm font-medium text-stone-900 dark:text-white">
              {t('cat_privacy_request')}
            </p>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('privacy_also')}</p>
            <a
              href={`mailto:${t('info_email')}`}
              className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              {t('info_email')}
            </a>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('privacy_verify')}</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-stone-900 dark:text-white">{t('security_title')}</h2>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('security_intro')}</p>
            <p className="text-sm font-medium text-stone-900 dark:text-white">
              {t('cat_security_concern')}
            </p>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('security_or')}</p>
            <a
              href={`mailto:${t('info_email')}`}
              className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
            >
              {t('info_email')}
            </a>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('security_detail')}</p>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">{t('security_dont')}</p>
          </section>
        </div>
      </section>
    </>
  );
}
