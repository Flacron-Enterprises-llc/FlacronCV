'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCVStore } from '@/store/cv-store';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import UpgradeModal from '@/components/shared/UpgradeModal';
import { X, Sparkles, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface AISummaryModalProps {
  cvId: string;
  open: boolean;
  onClose: () => void;
}

export default function AISummaryModal({ cvId, open, onClose }: AISummaryModalProps) {
  const t = useTranslations('cv_builder');
  const { updatePersonalInfo } = useCVStore();
  const { user } = useAuth();

  const [profession, setProfession] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('mid_level');
  const [keySkills, setKeySkills] = useState('');
  const [careerGoal, setCareerGoal] = useState('');
  const [generatedSummary, setGeneratedSummary] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  if (!open) return null;

  const creditsUsed = user?.usage?.aiCreditsUsed ?? 0;
  const creditsLimit = user?.usage?.aiCreditsLimit ?? 5;
  const outOfCredits = creditsUsed >= creditsLimit;

  const handleGenerate = async () => {
    if (outOfCredits) {
      setShowUpgrade(true);
      return;
    }
    if (!profession.trim()) {
      toast.error('Please enter your profession');
      return;
    }

    setIsGenerating(true);
    try {
      const result = await api.post<{ text: string; provider: string }>(`/ai/cv-summary`, {
        experience: `${experienceLevel.replace('_', ' ')} ${profession}`,
        skills: keySkills,
        targetRole: careerGoal || profession,
      });
      setGeneratedSummary(result.text);
    } catch (error) {
      // Fallback: generate a local summary if API fails
      const skills = keySkills.split(',').map((s) => s.trim()).filter(Boolean);
      const levelText = experienceLevel.replace('_', ' ');
      const fallback = `${levelText.charAt(0).toUpperCase() + levelText.slice(1)} ${profession} with expertise in ${skills.length > 0 ? skills.join(', ') : 'various technologies'}. ${careerGoal ? careerGoal + '.' : 'Passionate about delivering high-quality results and continuous professional growth.'}`;
      setGeneratedSummary(fallback);
      toast.info('Generated locally (API unavailable)');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUse = () => {
    updatePersonalInfo('summary', generatedSummary);
    toast.success('Summary added to your CV');
    onClose();
    // Reset state
    setGeneratedSummary('');
    setProfession('');
    setKeySkills('');
    setCareerGoal('');
  };

  const handleClose = () => {
    onClose();
    setGeneratedSummary('');
    setIsEditing(false);
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg animate-scale-in rounded-xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-stone-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-700">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-600" />
            <h3 className="text-lg font-semibold text-stone-900 dark:text-white">
              {t('ai_summary_title')}
            </h3>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {!generatedSummary ? (
            <>
              {/* Profession */}
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                  {t('profession')}
                </label>
                <input
                  type="text"
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                  placeholder={t('profession_placeholder')}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
                />
              </div>

              {/* Experience Level */}
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                  {t('experience_level')}
                </label>
                <select
                  value={experienceLevel}
                  onChange={(e) => setExperienceLevel(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
                >
                  <option value="entry_level">{t('entry_level')}</option>
                  <option value="mid_level">{t('mid_level')}</option>
                  <option value="senior_level">{t('senior_level')}</option>
                  <option value="executive">{t('executive')}</option>
                </select>
              </div>

              {/* Key Skills */}
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                  {t('key_skills')}
                </label>
                <input
                  type="text"
                  value={keySkills}
                  onChange={(e) => setKeySkills(e.target.value)}
                  placeholder={t('skills_placeholder')}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
                />
              </div>

              {/* Career Goal */}
              <div>
                <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">
                  {t('career_goal')}
                </label>
                <textarea
                  value={careerGoal}
                  onChange={(e) => setCareerGoal(e.target.value)}
                  placeholder={t('goal_placeholder')}
                  rows={2}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
                />
              </div>
            </>
          ) : (
            /* Generated Summary Result */
            <div className="space-y-3">
              <label className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                Generated Summary
              </label>
              {isEditing ? (
                <textarea
                  value={generatedSummary}
                  onChange={(e) => setGeneratedSummary(e.target.value)}
                  rows={5}
                  className="w-full rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-stone-600 dark:bg-stone-800 dark:text-white"
                />
              ) : (
                <div
                  className="cursor-pointer rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm leading-relaxed text-stone-700 hover:border-brand-300 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300"
                  onClick={() => setIsEditing(true)}
                  title="Click to edit"
                >
                  {generatedSummary}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-stone-200 px-5 py-3 dark:border-stone-700">
          {!generatedSummary ? (
            <>
              {outOfCredits && (
                <span className="me-auto text-xs text-red-500">
                  No AI credits remaining
                </span>
              )}
              {!outOfCredits && (
                <span className="me-auto text-xs text-stone-400">
                  {creditsLimit - creditsUsed} credits left
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Sparkles className="h-4 w-4" />}
                loading={isGenerating}
                onClick={handleGenerate}
                disabled={outOfCredits}
              >
                {isGenerating ? t('generating') : outOfCredits ? 'Upgrade to Generate' : t('generate_with_ai')}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw className="h-4 w-4" />}
                onClick={() => {
                  setGeneratedSummary('');
                  setIsEditing(false);
                }}
              >
                {t('regenerate')}
              </Button>
              <Button variant="primary" size="sm" onClick={handleUse}>
                {t('use_this')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>

    <UpgradeModal
      isOpen={showUpgrade}
      onClose={() => setShowUpgrade(false)}
      reason="ai_credits"
    />
    </>
  );
}
