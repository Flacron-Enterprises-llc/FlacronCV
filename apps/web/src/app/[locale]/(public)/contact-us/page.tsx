'use client';
import React from 'react';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import { Mail, Clock, CheckCircle, Send } from 'lucide-react';

export default function ContactUsPage(): React.JSX.Element {
  const t = useTranslations('contact');

  const [form, setForm] = useState({
    name: '',
    email: '',
    subject: '',
    category: 'general',
    message: '',
  });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Simulate sending (replace with real API call when backend endpoint exists)
      await new Promise((res) => setTimeout(res, 1200));
      setSent(true);
      toast.success(t('success_title'));
    } catch {
      toast.error(t('error'));
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    { value: 'general', label: t('category_general') },
    { value: 'support', label: t('category_support') },
    { value: 'billing', label: t('category_billing') },
    { value: 'partnership', label: t('category_partnership') },
  ];

  return (
    <>
      {/* Hero */}
      <section className="border-b border-stone-200 bg-gradient-to-b from-stone-50 to-white dark:border-stone-800 dark:from-stone-900 dark:to-black">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 dark:text-white sm:text-5xl">
            {t('title')}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-stone-600 dark:text-stone-400">
            {t('subtitle')}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-5">
          {/* Info column */}
          <div className="space-y-6 lg:col-span-2">
            <h2 className="text-xl font-bold text-stone-900 dark:text-white">{t('info_title')}</h2>

            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-stone-900 dark:text-white">{t('email_label')}</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('info_email')}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-stone-900 dark:text-white">{t('response_label')}</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('info_response')}</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">{t('info_hours')}</p>
              </div>
            </div>

            <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-900 dark:bg-brand-950/50">
              <p className="text-sm font-medium text-brand-700 dark:text-brand-300">
                💡 {t('tip')}
              </p>
            </div>
          </div>

          {/* Form column */}
          <div className="lg:col-span-3">
            {sent ? (
              <Card className="flex flex-col items-center py-16 text-center">
                <CheckCircle className="h-16 w-16 text-emerald-500" />
                <h3 className="mt-4 text-xl font-bold text-stone-900 dark:text-white">
                  {t('success_title')}
                </h3>
                <p className="mt-2 text-stone-500 dark:text-stone-400">{t('success_desc')}</p>
                <Button
                  variant="secondary"
                  className="mt-6"
                  onClick={() => {
                    setSent(false);
                    setForm({ name: '', email: '', subject: '', category: 'general', message: '' });
                  }}
                >
                  {t('send_another')}
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
                    <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
                      {t('category_label')}
                    </label>
                    <select
                      name="category"
                      value={form.category}
                      onChange={handleChange}
                      className="input-field"
                    >
                      {categories.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <Input
                    id="subject"
                    name="subject"
                    label={t('subject')}
                    value={form.subject}
                    onChange={handleChange}
                    placeholder={t('subject_placeholder')}
                    required
                  />

                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
                      {t('message')}
                    </label>
                    <textarea
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
      </section>
    </>
  );
}
