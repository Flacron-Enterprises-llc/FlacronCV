'use client';
import React from 'react';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import UpgradeModal from '@/components/shared/UpgradeModal';
import { toast } from 'sonner';
import { CoverLetter, CV } from '@flacroncv/shared-types';
import { Sparkles, FileText, ChevronDown } from 'lucide-react';

export default function NewCoverLetterPage(): React.JSX.Element {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [linkedCVId, setLinkedCVId] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Fetch existing CVs for the dropdown
  const { data: cvsData } = useQuery({
    queryKey: ['cvs'],
    queryFn: () => api.get<{ items: CV[] }>('/cvs'),
  });

  const cvs = cvsData?.items || [];

  const createMutation = useMutation({
    mutationFn: (data: {
      title: string;
      recipientName?: string;
      companyName?: string;
      jobTitle?: string;
      jobDescription?: string;
      linkedCVId?: string;
      generateWithAI?: boolean;
    }) => api.post<CoverLetter>('/cover-letters', data),
    onSuccess: (coverLetter) => {
      toast.success(t('coverLetters.created'));
      router.push(`/cover-letters/${coverLetter.id}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const generateJobDescMutation = useMutation({
    mutationFn: (data: { jobTitle: string; companyName?: string }) =>
      api.post<{ content: string }>('/ai/generate-job-description', data),
    onSuccess: (data) => {
      setJobDescription(data.content);
      toast.success(t('coverLetters.job_description_generated'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const generateJobDescription = () => {
    if (!jobTitle.trim()) {
      toast.error(t('coverLetters.job_title_required_for_ai'));
      return;
    }

    // Check AI credits
    const aiCreditsUsed = user?.usage?.aiCreditsUsed || 0;
    const aiCreditsLimit = user?.usage?.aiCreditsLimit || 5;

    if (aiCreditsUsed >= aiCreditsLimit) {
      setShowUpgradeModal(true);
      return;
    }

    generateJobDescMutation.mutate({
      jobTitle: jobTitle.trim(),
      companyName: companyName.trim() || undefined,
    });
  };

  const handleSubmit = (withAI: boolean) => {
    if (!title.trim()) {
      toast.error(t('coverLetters.title_required'));
      return;
    }

    if (withAI && (!jobTitle.trim() || !companyName.trim())) {
      toast.error(t('coverLetters.ai_fields_required'));
      return;
    }

    // Check AI credits before generating
    if (withAI) {
      const aiCreditsUsed = user?.usage?.aiCreditsUsed || 0;
      const aiCreditsLimit = user?.usage?.aiCreditsLimit || 5;

      if (aiCreditsUsed >= aiCreditsLimit) {
        setShowUpgradeModal(true);
        return;
      }
    }

    createMutation.mutate({
      title: title.trim(),
      recipientName: recipientName.trim() || undefined,
      companyName: companyName.trim() || undefined,
      jobTitle: jobTitle.trim() || undefined,
      jobDescription: jobDescription.trim() || undefined,
      linkedCVId: linkedCVId || undefined,
      generateWithAI: withAI,
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-stone-900 dark:text-white">
        {t('coverLetters.create_new')}
      </h1>

      <div className="space-y-6">
        {/* Basic info */}
        <Card>
          <h3 className="mb-4 font-semibold text-stone-900 dark:text-white">
            {t('coverLetters.basic_info')}
          </h3>
          <div className="space-y-4">
            <Input
              id="title"
              label={t('coverLetters.field_title')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('coverLetters.title_placeholder')}
              required
            />
            <Input
              id="recipientName"
              label={t('coverLetters.field_recipient')}
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder={t('coverLetters.recipient_placeholder')}
            />
          </div>
        </Card>

        {/* Job details */}
        <Card>
          <h3 className="mb-4 font-semibold text-stone-900 dark:text-white">
            {t('coverLetters.job_details')}
          </h3>
          <div className="space-y-4">
            <Input
              id="companyName"
              label={t('coverLetters.field_company')}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={t('coverLetters.company_placeholder')}
            />
            <Input
              id="jobTitle"
              label={t('coverLetters.field_job_title')}
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder={t('coverLetters.job_title_placeholder')}
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="jobDescription"
                  className="block text-sm font-medium text-stone-700 dark:text-stone-300"
                >
                  {t('coverLetters.field_job_description')}
                </label>
                <button
                  type="button"
                  onClick={() => generateJobDescription()}
                  disabled={!jobTitle.trim() || generateJobDescMutation.isPending}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-50 disabled:cursor-not-allowed dark:text-brand-400 dark:hover:bg-brand-900/20"
                >
                  {generateJobDescMutation.isPending ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-brand-600 border-t-transparent dark:border-brand-400" />
                      {t('coverLetters.generating')}
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      {t('coverLetters.generate_ai_description')}
                    </>
                  )}
                </button>
              </div>
              <textarea
                id="jobDescription"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                placeholder={t('coverLetters.job_description_placeholder')}
                rows={4}
                className="input-field resize-none"
              />
              <p className="text-xs text-stone-500">
                {t('coverLetters.job_description_hint')}
              </p>
            </div>
          </div>
        </Card>

        {/* Link to CV */}
        <Card>
          <h3 className="mb-4 font-semibold text-stone-900 dark:text-white">
            {t('coverLetters.link_cv')}
          </h3>
          <p className="mb-3 text-sm text-stone-500">
            {t('coverLetters.link_cv_description')}
          </p>
          <div className="relative">
            <select
              id="linkedCVId"
              value={linkedCVId}
              onChange={(e) => setLinkedCVId(e.target.value)}
              className="input-field appearance-none pe-10"
            >
              <option value="">{t('coverLetters.no_cv_selected')}</option>
              {cvs.map((cv) => (
                <option key={cv.id} value={cv.id}>
                  {cv.title}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -transtone-y-1/2 text-stone-400" />
          </div>
        </Card>

        {/* Action buttons */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" type="button" onClick={() => router.back()}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="outline"
            loading={createMutation.isPending && !createMutation.variables?.generateWithAI}
            onClick={() => handleSubmit(false)}
            icon={<FileText className="h-4 w-4" />}
          >
            {t('coverLetters.create_blank')}
          </Button>
          <Button
            loading={createMutation.isPending && !!createMutation.variables?.generateWithAI}
            onClick={() => handleSubmit(true)}
            icon={<Sparkles className="h-4 w-4" />}
          >
            {t('coverLetters.generate_with_ai')}
          </Button>
        </div>
      </div>

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        reason="ai_credits"
      />
    </div>
  );
}
