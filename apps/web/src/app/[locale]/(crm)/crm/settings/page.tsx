'use client';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { AppSettings } from '@flacroncv/shared-types';
import { formatDateTime } from '@/lib/format-date';
import { useAuth } from '@/providers/AuthProvider';
import { useRouter } from '@/i18n/routing';
import {
  Settings,
  Zap,
  Bot,
  FileText,
  Download,
  Briefcase,
  AlertTriangle,
  Megaphone,
  Save,
  Loader2,
  Lock,
  Shield,
  Crown,
} from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils';

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-stone-800 dark:text-stone-200">{label}</p>
        {description && <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          checked ? 'bg-brand-600' : 'bg-stone-300 dark:bg-stone-700',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200',
            checked ? 'translate-x-5.5' : 'translate-x-0.5',
          )}
          style={{ transform: checked ? 'translateX(1.4rem)' : 'translateX(0.125rem)' }}
        />
      </button>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  note,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  note?: string;
}) {
  const t = useTranslations('crm');
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">{label}</label>
      <input
        type="number"
        value={value === -1 ? '' : value}
        placeholder={value === -1 ? t('settings_unlimited_placeholder') : undefined}
        min={-1}
        onChange={(e) => onChange(e.target.value === '' ? -1 : parseInt(e.target.value, 10) || 0)}
        className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
      />
      {note && <p className="mt-0.5 text-xs text-stone-400">{note}</p>}
    </div>
  );
}

export default function CRMSettingsPage(): React.JSX.Element {
  const t = useTranslations('crm');
  const { user, placeholderAccount } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    // Skip while the account is a placeholder — its `role` is a default, so
    // acting on it would eject a super_admin over a transient sync failure.
    if (placeholderAccount) return;
    if (user && user.role !== 'super_admin') {
      router.push('/crm');
    }
  }, [user, placeholderAccount, router]);

  const { data: settings, isLoading } = useQuery<AppSettings>({
    queryKey: ['crm', 'settings'],
    queryFn: () => api.get('/crm/settings'),
    staleTime: 30_000,
    enabled: user?.role === 'super_admin',
  });

  const [form, setForm] = useState<AppSettings | null>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);

  useEffect(() => {
    // One-time initialization of the editable form from the fetched settings.
    // `form` is intentionally excluded (guarded by !form) so a background refetch
    // never clobbers in-progress edits.
    if (settings && !form) setForm(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (dto: Partial<AppSettings>) => api.put<AppSettings>('/crm/settings', dto),
    onSuccess: (updated: AppSettings) => {
      qc.setQueryData(['crm', 'settings'], updated);
      setForm(updated);
    },
  });

  const saveSection = async (section: string, dto: Partial<AppSettings>) => {
    try {
      await updateMutation.mutateAsync(dto);
      setSavedSection(section);
      setTimeout(() => setSavedSection(null), 2000);
    } catch {
      toast.error(t('settings_save_error'));
    }
  };

  // Only claim "restricted" once the role is actually known — a placeholder
  // account falls through to the spinner below instead.
  if (!placeholderAccount && user?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-stone-400">
        <Lock className="mb-3 h-12 w-12" />
        <p className="text-lg font-semibold text-stone-700 dark:text-stone-300">{t('settings_super_admin_only')}</p>
        <p className="mt-1 text-sm">{t('settings_super_admin_restricted')}</p>
      </div>
    );
  }

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const planLimitFields: { key: keyof typeof form.planLimits.free; label: string; icon: React.ElementType }[] = [
    { key: 'cvsLimit', label: t('settings_cvs_limit_label'), icon: FileText },
    { key: 'coverLettersLimit', label: t('settings_cover_letters_limit_label'), icon: Briefcase },
    { key: 'aiCreditsLimit', label: t('settings_ai_credits_limit_label'), icon: Bot },
    { key: 'exportsLimit', label: t('settings_exports_per_month_label'), icon: Download },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('settings_title')}</h1>
            <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
              <Crown className="h-3 w-3" /> {t('role_super_admin')}
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {t('settings_subtitle')}
          </p>
        </div>
        {settings?.updatedAt && (
          <p className="text-xs text-stone-400">
            {t('settings_last_saved', { date: formatDateTime(settings.updatedAt) })}
            {settings.updatedBy ? ` ${t('settings_saved_by', { user: settings.updatedBy })}` : ''}
          </p>
        )}
      </div>

      {/* Plan Limits */}
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-stone-900 dark:text-white">{t('settings_plan_limits_heading')}</h2>
          </div>
          <p className="text-xs text-stone-400">{t('settings_unlimited_hint')}</p>
        </div>

        <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
          <p className="text-xs text-amber-700 dark:text-amber-400">{t('settings_plan_limits_not_enforced')}</p>
        </div>

        <div className="space-y-6">
          {(['free', 'pro', 'enterprise'] as const).map((plan) => (
            <div key={plan}>
              <div className="mb-3 flex items-center gap-2">
                <div className={cn(
                  'h-2 w-2 rounded-full',
                  plan === 'free' ? 'bg-stone-400' : plan === 'pro' ? 'bg-brand-500' : 'bg-violet-500',
                )} />
                <h3 className={cn(
                  'text-sm font-semibold capitalize',
                  plan === 'free' ? 'text-stone-600 dark:text-stone-400' :
                  plan === 'pro' ? 'text-brand-600 dark:text-brand-400' :
                  'text-violet-600 dark:text-violet-400',
                )}>
                  {t('settings_plan_heading', { plan })}
                </h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {planLimitFields.map(({ key, label }) => (
                  <NumberInput
                    key={key}
                    label={label}
                    value={form.planLimits[plan][key]}
                    onChange={(v) =>
                      setForm((f) => f ? {
                        ...f,
                        planLimits: {
                          ...f.planLimits,
                          [plan]: { ...f.planLimits[plan], [key]: v },
                        },
                      } : f)
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            size="sm"
            loading={updateMutation.isPending}
            icon={savedSection === 'planLimits' ? undefined : <Save className="h-4 w-4" />}
            onClick={() => saveSection('planLimits', { planLimits: form.planLimits })}
          >
            {savedSection === 'planLimits' ? t('saved') : t('settings_save_plan_limits')}
          </Button>
        </div>
      </Card>

      {/* Feature Flags */}
      <Card>
        <div className="mb-5 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-stone-900 dark:text-white">{t('settings_feature_flags_heading')}</h2>
        </div>

        <div className="space-y-4">
          <Toggle
            checked={form.featureFlags.aiEnabled}
            onChange={(v) => setForm((f) => f ? { ...f, featureFlags: { ...f.featureFlags, aiEnabled: v } } : f)}
            label={t('settings_ai_features_label')}
            description={t('settings_ai_features_desc')}
          />
          <div className="border-t border-stone-100 dark:border-stone-800" />
          <Toggle
            checked={form.featureFlags.templatesEnabled}
            onChange={(v) => setForm((f) => f ? { ...f, featureFlags: { ...f.featureFlags, templatesEnabled: v } } : f)}
            label={t('settings_templates_label')}
            description={t('settings_templates_desc')}
          />
          <div className="border-t border-stone-100 dark:border-stone-800" />
          <Toggle
            checked={form.featureFlags.exportsEnabled}
            onChange={(v) => setForm((f) => f ? { ...f, featureFlags: { ...f.featureFlags, exportsEnabled: v } } : f)}
            label={t('settings_exports_label')}
            description={t('settings_exports_desc')}
          />
          <div className="border-t border-stone-100 dark:border-stone-800" />
          <Toggle
            checked={form.featureFlags.coverLettersEnabled}
            onChange={(v) => setForm((f) => f ? { ...f, featureFlags: { ...f.featureFlags, coverLettersEnabled: v } } : f)}
            label={t('settings_cover_letters_label')}
            description={t('settings_cover_letters_desc')}
          />
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            size="sm"
            loading={updateMutation.isPending}
            icon={savedSection === 'featureFlags' ? undefined : <Save className="h-4 w-4" />}
            onClick={() => saveSection('featureFlags', { featureFlags: form.featureFlags })}
          >
            {savedSection === 'featureFlags' ? t('saved') : t('settings_save_feature_flags')}
          </Button>
        </div>
      </Card>

      {/* Maintenance Mode */}
      <Card className={form.maintenanceMode.enabled ? 'border-red-300 dark:border-red-900' : ''}>
        <div className="mb-5 flex items-center gap-2">
          <AlertTriangle className={cn('h-4 w-4', form.maintenanceMode.enabled ? 'text-red-500' : 'text-stone-400')} />
          <h2 className="text-sm font-semibold text-stone-900 dark:text-white">{t('settings_maintenance_heading')}</h2>
          {form.maintenanceMode.enabled && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950 dark:text-red-400">
              {t('status_active')}
            </span>
          )}
        </div>

        <div className="space-y-4">
          <Toggle
            checked={form.maintenanceMode.enabled}
            onChange={(v) => setForm((f) => f ? { ...f, maintenanceMode: { ...f.maintenanceMode, enabled: v } } : f)}
            label={t('settings_maintenance_toggle_label')}
            description={t('settings_maintenance_toggle_desc')}
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              {t('settings_maintenance_message_label')}
            </label>
            <textarea
              value={form.maintenanceMode.message}
              onChange={(e) => setForm((f) => f ? { ...f, maintenanceMode: { ...f.maintenanceMode, message: e.target.value } } : f)}
              rows={2}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            size="sm"
            variant={form.maintenanceMode.enabled ? 'danger' : 'primary'}
            loading={updateMutation.isPending}
            icon={savedSection === 'maintenanceMode' ? undefined : <Save className="h-4 w-4" />}
            onClick={() => saveSection('maintenanceMode', { maintenanceMode: form.maintenanceMode })}
          >
            {savedSection === 'maintenanceMode' ? t('saved') : t('settings_save_maintenance')}
          </Button>
        </div>
      </Card>

      {/* Announcement Banner */}
      <Card>
        <div className="mb-5 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-stone-900 dark:text-white">{t('settings_announcement_heading')}</h2>
          {form.announcement.enabled && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-400">
              {t('settings_announcement_live')}
            </span>
          )}
        </div>

        <div className="space-y-4">
          <Toggle
            checked={form.announcement.enabled}
            onChange={(v) => setForm((f) => f ? { ...f, announcement: { ...f.announcement, enabled: v } } : f)}
            label={t('settings_announcement_toggle_label')}
            description={t('settings_announcement_toggle_desc')}
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              {t('settings_announcement_type_label')}
            </label>
            <div className="flex gap-2">
              {(['info', 'warning', 'success', 'danger'] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => setForm((f) => f ? { ...f, announcement: { ...f.announcement, type: sev } } : f)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                    form.announcement.type === sev
                      ? {
                          info: 'bg-blue-600 text-white',
                          warning: 'bg-amber-500 text-white',
                          success: 'bg-emerald-600 text-white',
                          danger: 'bg-red-600 text-white',
                        }[sev]
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400',
                  )}
                >
                  {t(`severity_${sev}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              {t('settings_announcement_message_label')}
            </label>
            <textarea
              value={form.announcement.message}
              onChange={(e) => setForm((f) => f ? { ...f, announcement: { ...f.announcement, message: e.target.value } } : f)}
              rows={2}
              placeholder={t('settings_announcement_message_placeholder')}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
            />
          </div>

          {form.announcement.enabled && form.announcement.message && (
            <div className={cn(
              'rounded-lg border px-4 py-3 text-sm',
              {
                info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
                warning: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
                success: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300',
                danger: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
              }[form.announcement.type],
            )}>
              <span className="font-semibold">{t('settings_announcement_preview_label')}</span>{form.announcement.message}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            size="sm"
            loading={updateMutation.isPending}
            icon={savedSection === 'announcement' ? undefined : <Save className="h-4 w-4" />}
            onClick={() => saveSection('announcement', { announcement: form.announcement })}
          >
            {savedSection === 'announcement' ? t('saved') : t('settings_save_announcement')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
