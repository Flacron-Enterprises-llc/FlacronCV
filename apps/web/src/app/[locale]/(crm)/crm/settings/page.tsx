'use client';

import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { AppSettings } from '@flacroncv/shared-types';
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
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors duration-200 focus:outline-none',
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
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">{label}</label>
      <input
        type="number"
        value={value === -1 ? '' : value}
        placeholder={value === -1 ? '∞ Unlimited' : undefined}
        min={-1}
        onChange={(e) => onChange(e.target.value === '' ? -1 : parseInt(e.target.value, 10) || 0)}
        className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
      />
      {note && <p className="mt-0.5 text-xs text-stone-400">{note}</p>}
    </div>
  );
}

export default function CRMSettingsPage(): React.JSX.Element {
  const { user } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();

  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      router.push('/crm');
    }
  }, [user, router]);

  const { data: settings, isLoading } = useQuery<AppSettings>({
    queryKey: ['crm', 'settings'],
    queryFn: () => api.get('/crm/settings'),
    staleTime: 30_000,
    enabled: user?.role === 'super_admin',
  });

  const [form, setForm] = useState<AppSettings | null>(null);
  const [savedSection, setSavedSection] = useState<string | null>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: (dto: Partial<AppSettings>) => api.put<AppSettings>('/crm/settings', dto),
    onSuccess: (updated: AppSettings) => {
      qc.setQueryData(['crm', 'settings'], updated);
      setForm(updated);
    },
  });

  const saveSection = async (section: string, dto: Partial<AppSettings>) => {
    await updateMutation.mutateAsync(dto);
    setSavedSection(section);
    setTimeout(() => setSavedSection(null), 2000);
  };

  if (user?.role !== 'super_admin') {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-stone-400">
        <Lock className="mb-3 h-12 w-12" />
        <p className="text-lg font-semibold text-stone-700 dark:text-stone-300">Super Admin Only</p>
        <p className="mt-1 text-sm">This section is restricted to super administrators.</p>
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
    { key: 'cvsLimit', label: 'CVs Limit', icon: FileText },
    { key: 'coverLettersLimit', label: 'Cover Letters Limit', icon: Briefcase },
    { key: 'aiCreditsLimit', label: 'AI Credits Limit', icon: Bot },
    { key: 'exportsLimit', label: 'Exports / Month', icon: Download },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-stone-900 dark:text-white">App Settings</h1>
            <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
              <Crown className="h-3 w-3" /> Super Admin
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Configure plan limits, feature flags, and platform-wide settings.
          </p>
        </div>
        {settings?.updatedAt && (
          <p className="text-xs text-stone-400">
            Last saved: {new Date(settings.updatedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            {settings.updatedBy ? ` by ${settings.updatedBy}` : ''}
          </p>
        )}
      </div>

      {/* Plan Limits */}
      <Card>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-stone-900 dark:text-white">Plan Limits</h2>
          </div>
          <p className="text-xs text-stone-400">-1 = unlimited</p>
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
                  {plan} Plan
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
            {savedSection === 'planLimits' ? '✓ Saved' : 'Save Plan Limits'}
          </Button>
        </div>
      </Card>

      {/* Feature Flags */}
      <Card>
        <div className="mb-5 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-stone-900 dark:text-white">Feature Flags</h2>
        </div>

        <div className="space-y-4">
          <Toggle
            checked={form.featureFlags.aiEnabled}
            onChange={(v) => setForm((f) => f ? { ...f, featureFlags: { ...f.featureFlags, aiEnabled: v } } : f)}
            label="AI Features"
            description="Enables AI-powered CV writing, suggestions, and cover letter generation"
          />
          <div className="border-t border-stone-100 dark:border-stone-800" />
          <Toggle
            checked={form.featureFlags.templatesEnabled}
            onChange={(v) => setForm((f) => f ? { ...f, featureFlags: { ...f.featureFlags, templatesEnabled: v } } : f)}
            label="Templates"
            description="Allow users to browse and use CV templates"
          />
          <div className="border-t border-stone-100 dark:border-stone-800" />
          <Toggle
            checked={form.featureFlags.exportsEnabled}
            onChange={(v) => setForm((f) => f ? { ...f, featureFlags: { ...f.featureFlags, exportsEnabled: v } } : f)}
            label="PDF / DOCX Exports"
            description="Allow users to export CVs and cover letters"
          />
          <div className="border-t border-stone-100 dark:border-stone-800" />
          <Toggle
            checked={form.featureFlags.coverLettersEnabled}
            onChange={(v) => setForm((f) => f ? { ...f, featureFlags: { ...f.featureFlags, coverLettersEnabled: v } } : f)}
            label="Cover Letters"
            description="Enable the cover letter creation module"
          />
        </div>

        <div className="mt-5 flex justify-end">
          <Button
            size="sm"
            loading={updateMutation.isPending}
            icon={savedSection === 'featureFlags' ? undefined : <Save className="h-4 w-4" />}
            onClick={() => saveSection('featureFlags', { featureFlags: form.featureFlags })}
          >
            {savedSection === 'featureFlags' ? '✓ Saved' : 'Save Feature Flags'}
          </Button>
        </div>
      </Card>

      {/* Maintenance Mode */}
      <Card className={form.maintenanceMode.enabled ? 'border-red-300 dark:border-red-900' : ''}>
        <div className="mb-5 flex items-center gap-2">
          <AlertTriangle className={cn('h-4 w-4', form.maintenanceMode.enabled ? 'text-red-500' : 'text-stone-400')} />
          <h2 className="text-sm font-semibold text-stone-900 dark:text-white">Maintenance Mode</h2>
          {form.maintenanceMode.enabled && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-950 dark:text-red-400">
              ACTIVE
            </span>
          )}
        </div>

        <div className="space-y-4">
          <Toggle
            checked={form.maintenanceMode.enabled}
            onChange={(v) => setForm((f) => f ? { ...f, maintenanceMode: { ...f.maintenanceMode, enabled: v } } : f)}
            label="Enable Maintenance Mode"
            description="When enabled, users see a maintenance page and cannot log in"
          />
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              Maintenance Message
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
            {savedSection === 'maintenanceMode' ? '✓ Saved' : 'Save Maintenance Settings'}
          </Button>
        </div>
      </Card>

      {/* Announcement Banner */}
      <Card>
        <div className="mb-5 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-stone-900 dark:text-white">Announcement Banner</h2>
          {form.announcement.enabled && (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-400">
              LIVE
            </span>
          )}
        </div>

        <div className="space-y-4">
          <Toggle
            checked={form.announcement.enabled}
            onChange={(v) => setForm((f) => f ? { ...f, announcement: { ...f.announcement, enabled: v } } : f)}
            label="Show Announcement Banner"
            description="Display a banner message to all users on every page"
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              Announcement Type
            </label>
            <div className="flex gap-2">
              {(['info', 'warning', 'success', 'danger'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setForm((f) => f ? { ...f, announcement: { ...f.announcement, type: t } } : f)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors',
                    form.announcement.type === t
                      ? {
                          info: 'bg-blue-600 text-white',
                          warning: 'bg-amber-500 text-white',
                          success: 'bg-emerald-600 text-white',
                          danger: 'bg-red-600 text-white',
                        }[t]
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600 dark:text-stone-400">
              Announcement Message
            </label>
            <textarea
              value={form.announcement.message}
              onChange={(e) => setForm((f) => f ? { ...f, announcement: { ...f.announcement, message: e.target.value } } : f)}
              rows={2}
              placeholder="e.g. We're launching a new Pro plan! Get 50% off for the first 3 months."
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
              <span className="font-semibold">Preview: </span>{form.announcement.message}
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
            {savedSection === 'announcement' ? '✓ Saved' : 'Save Announcement'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
