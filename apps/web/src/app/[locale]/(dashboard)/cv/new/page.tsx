'use client';
import React from 'react';

import { useState, useEffect } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/providers/AuthProvider';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { CV_NEW_DRAFT_KEY as DRAFT_KEY } from './constants';

export default function NewCVPage(): React.JSX.Element | null {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState('');

  // Restore draft title from sessionStorage on first mount
  useEffect(() => {
    const saved = sessionStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const { title: savedTitle } = JSON.parse(saved) as { title: string };
        if (savedTitle) setTitle(savedTitle);
      } catch {
        sessionStorage.removeItem(DRAFT_KEY);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist title to sessionStorage
  useEffect(() => {
    if (title) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title }));
    }
  }, [title]);

  const handleCancel = () => {
    sessionStorage.removeItem(DRAFT_KEY);
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard');
    }
  };

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a title for your CV');
      return;
    }
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ title: title.trim() }));
    router.push('/cv/new/pick-template');
  };

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
            1
          </span>
          <span className="text-sm font-semibold text-stone-900 dark:text-white">CV Details</span>
        </div>
        <div className="h-px flex-1 bg-stone-200 dark:bg-stone-700" />
        <div className="flex items-center gap-2 opacity-40">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-stone-300 text-sm font-bold text-stone-400 dark:border-stone-600 dark:text-stone-500">
            2
          </span>
          <span className="text-sm font-medium text-stone-400 dark:text-stone-500">Choose Template</span>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
        {t('dashboard.create_cv')}
      </h1>

      <form onSubmit={handleContinue} className="space-y-6">
        <Card>
          <div className="space-y-5">
            <Input
              id="title"
              label="CV Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Software Engineer CV 2025"
              required
              hint="Give your CV a descriptive name to find it easily later."
              data-testid="cv-title-input"
            />
          </div>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            type="button"
            onClick={handleCancel}
            data-testid="cancel-btn"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            icon={<ArrowRight className="h-4 w-4" />}
            data-testid="continue-btn"
          >
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}
