'use client';
import React from 'react';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, useRouter, usePathname } from '@/i18n/routing';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { api } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User, UserProfile, UserPreferences, Locale, Theme } from '@flacroncv/shared-types';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import Modal from '@/components/ui/Modal';
import { Camera, Save, Trash2, Lock, Globe, Palette, Bell } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage(): React.JSX.Element {
  const t = useTranslations('settings');
  const { user, resetPassword } = useAuth();
  const { setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  // Profile form state
  const [profile, setProfile] = useState<Partial<UserProfile>>({
    firstName: '',
    lastName: '',
    headline: '',
    bio: '',
    location: '',
    linkedin: '',
    github: '',
  });

  // Preferences state
  const [preferences, setPreferences] = useState<Partial<UserPreferences>>({
    language: Locale.EN,
    theme: Theme.SYSTEM,
    emailNotifications: true,
  });

  // Delete account modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Change password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordResetSent, setPasswordResetSent] = useState(false);

  // Populate form from user data
  useEffect(() => {
    if (user) {
      setProfile({
        firstName: user.profile?.firstName || '',
        lastName: user.profile?.lastName || '',
        headline: user.profile?.headline || '',
        bio: user.profile?.bio || '',
        location: user.profile?.location || '',
        linkedin: user.profile?.linkedin || '',
        github: user.profile?.github || '',
      });
      setPreferences({
        language: user.preferences?.language || Locale.EN,
        theme: user.preferences?.theme || Theme.SYSTEM,
        emailNotifications: user.preferences?.emailNotifications ?? true,
      });
    }
  }, [user]);

  // Profile mutation
  const profileMutation = useMutation({
    mutationFn: (data: Partial<UserProfile>) => api.put<User>('/users/me', { profile: data }),
    onSuccess: () => {
      toast.success(t('profile.saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('profile.saveError'));
    },
  });

  // Preferences mutation
  const preferencesMutation = useMutation({
    mutationFn: (data: Partial<UserPreferences>) =>
      api.patch<User>('/users/me/preferences', data),
    onSuccess: (_, variables) => {
      toast.success(t('preferences.saveSuccess'));
      queryClient.invalidateQueries({ queryKey: ['user'] });

      // Apply theme immediately
      if (variables.theme) {
        setTheme(variables.theme);
      }

      // Apply language immediately (redirect to new locale)
      if (variables.language) {
        router.replace(pathname, { locale: variables.language });
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t('preferences.saveError'));
    },
  });

  // Delete account mutation
  const deleteMutation = useMutation({
    mutationFn: () => api.delete('/users/me'),
    onSuccess: () => {
      toast.success(t('account.deleteSuccess'));
      router.push('/');
    },
    onError: (error: Error) => {
      toast.error(error.message || t('account.deleteError'));
    },
  });

  const handleProfileSave = () => {
    profileMutation.mutate(profile);
  };

  const handlePreferencesSave = () => {
    preferencesMutation.mutate(preferences);
  };

  const handleDeleteAccount = () => {
    if (deleteConfirmText === 'DELETE') {
      deleteMutation.mutate();
    }
  };

  const handleSendPasswordReset = async () => {
    if (!user?.email) return;
    try {
      await resetPassword(user.email);
      setPasswordResetSent(true);
      toast.success('Password reset email sent! Check your inbox.');
    } catch (error) {
      toast.error('Failed to send reset email');
    }
  };

  const languageOptions = [
    { value: Locale.EN, label: 'English' },
    { value: Locale.ES, label: 'Espanol' },
    { value: Locale.FR, label: 'Francais' },
    { value: Locale.DE, label: 'Deutsch' },
    { value: Locale.AR, label: 'العربية' },
    { value: Locale.UR, label: 'اردو' },
  ];

  const themeOptions = [
    { value: Theme.LIGHT, label: t('preferences.themeLight') },
    { value: Theme.DARK, label: t('preferences.themeDark') },
    { value: Theme.SYSTEM, label: t('preferences.themeSystem') },
  ];

  return (
    <div className="space-y-8">
      {/* Avatar Section */}
      <Card>
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-brand-100 dark:bg-brand-900">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-2xl font-bold text-brand-600 dark:text-brand-400">
                  {user?.displayName?.charAt(0)?.toUpperCase() || '?'}
                </span>
              )}
            </div>
            <button
              type="button"
              className="absolute -bottom-1 -end-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-sm transition-colors hover:bg-brand-700 dark:border-stone-800"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <div className="text-center sm:text-start">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-white">
              {user?.displayName || t('profile.unnamed')}
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">{user?.email}</p>
          </div>
        </div>
      </Card>

      {/* Profile Information */}
      <Card>
        <h3 className="mb-6 text-lg font-semibold text-stone-900 dark:text-white">
          {t('profile.title')}
        </h3>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              id="firstName"
              label={t('profile.firstName')}
              value={profile.firstName}
              onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
              placeholder={t('profile.firstNamePlaceholder')}
            />
            <Input
              id="lastName"
              label={t('profile.lastName')}
              value={profile.lastName}
              onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
              placeholder={t('profile.lastNamePlaceholder')}
            />
          </div>
          <Input
            id="headline"
            label={t('profile.headline')}
            value={profile.headline}
            onChange={(e) => setProfile((p) => ({ ...p, headline: e.target.value }))}
            placeholder={t('profile.headlinePlaceholder')}
          />
          <div className="space-y-1.5">
            <label
              htmlFor="bio"
              className="block text-sm font-medium text-stone-700 dark:text-stone-300"
            >
              {t('profile.bio')}
            </label>
            <textarea
              id="bio"
              rows={4}
              className="input-field resize-none"
              value={profile.bio}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              placeholder={t('profile.bioPlaceholder')}
            />
          </div>
          <Input
            id="location"
            label={t('profile.location')}
            value={profile.location}
            onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))}
            placeholder={t('profile.locationPlaceholder')}
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              id="linkedin"
              label={t('profile.linkedin')}
              value={profile.linkedin}
              onChange={(e) => setProfile((p) => ({ ...p, linkedin: e.target.value }))}
              placeholder="https://linkedin.com/in/username"
            />
            <Input
              id="github"
              label={t('profile.github')}
              value={profile.github}
              onChange={(e) => setProfile((p) => ({ ...p, github: e.target.value }))}
              placeholder="https://github.com/username"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleProfileSave}
              loading={profileMutation.isPending}
              icon={<Save className="h-4 w-4" />}
            >
              {t('profile.save')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Preferences */}
      <Card>
        <h3 className="mb-6 text-lg font-semibold text-stone-900 dark:text-white">
          {t('preferences.title')}
        </h3>
        <div className="space-y-6">
          {/* Language */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-900/30">
                <Globe className="h-5 w-5 text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-white">
                  {t('preferences.language')}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {t('preferences.languageDescription')}
                </p>
              </div>
            </div>
            <select
              value={preferences.language}
              onChange={(e) =>
                setPreferences((p) => ({ ...p, language: e.target.value as Locale }))
              }
              className="input-field w-full sm:w-44"
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Theme */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-900/30">
                <Palette className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-white">
                  {t('preferences.theme')}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {t('preferences.themeDescription')}
                </p>
              </div>
            </div>
            <select
              value={preferences.theme}
              onChange={(e) =>
                setPreferences((p) => ({ ...p, theme: e.target.value as Theme }))
              }
              className="input-field w-full sm:w-44"
            >
              {themeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Email Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-900/30">
                <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-white">
                  {t('preferences.emailNotifications')}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {t('preferences.emailNotificationsDescription')}
                </p>
              </div>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                checked={preferences.emailNotifications}
                onChange={(e) =>
                  setPreferences((p) => ({ ...p, emailNotifications: e.target.checked }))
                }
                className="peer sr-only"
              />
              <div className="peer h-6 w-11 rounded-full bg-stone-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-stone-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-600 peer-checked:after:transtone-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-brand-300 rtl:peer-checked:after:-transtone-x-full dark:border-stone-600 dark:bg-stone-700 dark:peer-focus:ring-brand-800" />
            </label>
          </div>

          <div className="flex justify-end border-t border-stone-200 pt-4 dark:border-stone-700">
            <Button
              onClick={handlePreferencesSave}
              loading={preferencesMutation.isPending}
              icon={<Save className="h-4 w-4" />}
            >
              {t('preferences.save')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Account */}
      <Card>
        <h3 className="mb-6 text-lg font-semibold text-stone-900 dark:text-white">
          {t('account.title')}
        </h3>
        <div className="space-y-5">
          {/* Email */}
          <Input
            id="email"
            label={t('account.email')}
            value={user?.email || ''}
            readOnly
            hint={t('account.emailHint')}
          />

          {/* Change Password */}
          <div className="flex items-center justify-between rounded-lg border border-stone-200 p-4 dark:border-stone-700">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-stone-400" />
              <div>
                <p className="text-sm font-medium text-stone-900 dark:text-white">
                  {t('account.password')}
                </p>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  {t('account.passwordDescription')}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPasswordModal(true)}
            >
              {t('account.changePassword')}
            </Button>
          </div>

          {/* Danger Zone */}
          <div className="rounded-lg border border-red-200 p-4 dark:border-red-900/50">
            <h4 className="mb-2 text-sm font-semibold text-red-600 dark:text-red-400">
              {t('account.dangerZone')}
            </h4>
            <p className="mb-4 text-sm text-stone-600 dark:text-stone-400">
              {t('account.deleteDescription')}
            </p>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => setShowDeleteModal(true)}
            >
              {t('account.deleteAccount')}
            </Button>
          </div>
        </div>
      </Card>

      {/* Delete Account Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setDeleteConfirmText('');
        }}
        title={t('account.deleteModalTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {t('account.deleteModalDescription')}
          </p>
          <Input
            id="deleteConfirm"
            label={t('account.deleteModalLabel')}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
          />
          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setDeleteConfirmText('');
              }}
            >
              {t('account.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteAccount}
              disabled={deleteConfirmText !== 'DELETE'}
              loading={deleteMutation.isPending}
            >
              {t('account.confirmDelete')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPasswordResetSent(false);
        }}
        title="Change Password"
        size="sm"
      >
        <div className="space-y-4">
          {passwordResetSent ? (
            <div className="text-center py-6">
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-stone-900 dark:text-white">Check your email</h3>
              <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
                We sent a password reset link to <strong>{user?.email}</strong>
              </p>
              <Button
                variant="primary"
                className="mt-6"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordResetSent(false);
                }}
              >
                Done
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-stone-600 dark:text-stone-400">
                We'll send you an email with a link to reset your password. Click the link in the email to create a new password.
              </p>
              <div className="flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setShowPasswordModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSendPasswordReset}
                >
                  Send Reset Link
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
