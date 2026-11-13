'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { salesInquiryInput } from '@flacroncv/career-shared';
import { isApiError, type ApiClient } from '@flacroncv/career-api-client';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useCareerApi } from '@/components/career/CareerServices';

type Status = 'idle' | 'saved' | 'undelivered' | 'invalid' | 'error' | 'limited';
type FieldError = 'contact_name_error' | 'contact_email_error' | 'contact_organization_error' | 'contact_message_error';

/**
 * Business contact form (port of V2's ContactSalesForm). Posts to the career
 * service's public, rate-limited `POST /sales-inquiries`, which stores the
 * inquiry. The reply says whether an email went out; the copy never claims
 * delivery when it did not happen.
 */
export function ContactSalesForm({ api }: { api?: ApiClient } = {}) {
  const t = useTranslations('career_pricing');
  const careerApi = useCareerApi();
  const client = api ?? careerApi;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [fieldError, setFieldError] = useState<FieldError | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFieldError(null);
    const parsed = salesInquiryInput({ name, email, organization, message });
    if (!parsed) {
      setStatus('invalid');
      if (name.trim().length < 2 || name.trim().length > 120) setFieldError('contact_name_error');
      else if (!email.includes('@') || email.trim().length > 200) setFieldError('contact_email_error');
      else if (organization.trim().length < 2 || organization.trim().length > 120) setFieldError('contact_organization_error');
      else setFieldError('contact_message_error');
      return;
    }
    setPending(true);
    try {
      const result = await client.createSalesInquiry(parsed);
      setStatus(result.delivered ? 'saved' : 'undelivered');
      setName('');
      setEmail('');
      setOrganization('');
      setMessage('');
    } catch (error) {
      setStatus(isApiError(error, 'rate_limited') ? 'limited' : 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="mt-6 grid max-w-xl gap-4" noValidate>
      <Input
        id="contact-sales-name"
        label={t('contact_name')}
        name="name"
        autoComplete="name"
        required
        maxLength={120}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Input
        id="contact-sales-email"
        label={t('contact_email')}
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={200}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        id="contact-sales-organization"
        label={t('contact_organization')}
        name="organization"
        autoComplete="organization"
        required
        maxLength={120}
        value={organization}
        onChange={(event) => setOrganization(event.target.value)}
      />
      <div className="space-y-1.5">
        <label htmlFor="contact-sales-message" className="block text-sm font-medium text-stone-700 dark:text-stone-300">
          {t('contact_message')}
        </label>
        <textarea
          id="contact-sales-message"
          name="message"
          required
          rows={5}
          maxLength={2000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="input-field"
        />
      </div>
      {fieldError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {t(fieldError)}
        </p>
      ) : null}
      {status === 'undelivered' ? (
        <p role="status" className="text-sm text-stone-700 dark:text-stone-200">
          {t('contact_saved_undelivered')}
        </p>
      ) : null}
      {status === 'saved' ? (
        <p role="status" className="text-sm text-stone-700 dark:text-stone-200">
          {t('contact_saved')}
        </p>
      ) : null}
      {status === 'error' ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {t('contact_error')}
        </p>
      ) : null}
      {status === 'limited' ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {t('contact_limited')}
        </p>
      ) : null}
      <div>
        <Button type="submit" loading={pending}>
          {pending ? t('contact_submitting') : t('contact_submit')}
        </Button>
      </div>
    </form>
  );
}
