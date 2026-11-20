import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../../src/store/auth-store';
import { revokeAllSessions, useCurrentUser, useUpdatePreferences } from '../../../src/hooks/useUser';
import {
  EMAIL_PREFERENCE_KEYS,
  EmailPreferenceKey,
  emailPreferencePatch,
  emailPreferenceValue,
  sendPasswordResetToSelf,
  signOutEverywhere,
} from '../../../src/lib/account-settings';
import { requestFailureMessage } from '../../../src/lib/api-errors';
import { planForDisplay, sharedPlanLimits } from '../../../src/lib/entitlements';
import { JobApplication } from '../../../src/types/job.types';
import { Locale } from '../../../src/types/enums';
import { openLegalDocument } from '../../../src/lib/legal-acceptance';
import { CAREER_ENABLED } from '../../../src/config/career';
import { Avatar } from '../../../src/components/ui/Avatar';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Modal } from '../../../src/components/ui/Modal';
import { colors } from '../../../src/theme/colors';
import { api } from '../../../src/lib/api';
import { cancelAllJobReminders, reconcileJobReminders } from '../../../src/lib/job-reminders';
import { disablePushNotifications, enablePushNotifications } from '../../../src/lib/push';
import { useAppTourReplay } from '../../../src/hooks/useAppTour';
import {
  LANGUAGE_NAMES,
  SUPPORTED_LOCALES,
  isRTLLocale,
  t as tNow,
  useLocale,
  useT,
  type AppLocale,
  type TFunction,
  hasKey,
} from '../../../src/i18n';
import {
  RTL_FLIP,
  canReloadForDirection,
  changeLanguage,
  reloadForDirection,
} from '../../../src/i18n/native';

type SettingsMenuItem = {
  icon: string;
  label: string;
  onPress: () => void;
  badge?: string;
  description?: string;
  disabled?: boolean;
};

function loadFailureMessage(err: unknown, t: TFunction, tc: TFunction): string {
  if (axios.isAxiosError(err) && !err.response) {
    return tc('noConnection');
  }
  return t('usage.loadError');
}

/** The real plan name: five-plan catalog names for current plans, the old names for legacy ones. */
function planName(plan: string, t: TFunction): string {
  return hasKey(`settings.plans.${plan}`) ? t(`plans.${plan}`) : t('plans.free');
}

export default function SettingsScreen() {
  const t = useT('settings');
  const tc = useT('common');
  const tPlans = useT('plans');
  const locale = useLocale();
  const router = useRouter();
  const replayTour = useAppTourReplay();
  const queryClient = useQueryClient();
  const { user: authUser, logout, resetPassword, syncUser, userSyncError } = useAuthStore();
  const { data: user, error: userError, refetch } = useCurrentUser();
  const updatePreferences = useUpdatePreferences();
  const [pushBusy, setPushBusy] = useState(false);
  // Optimistic value per email toggle while its PATCH is in flight.
  const [emailPending, setEmailPending] = useState<Partial<Record<EmailPreferenceKey, boolean>>>({});
  const [sendingReset, setSendingReset] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [languageBusy, setLanguageBusy] = useState(false);

  const currentUser = user ?? authUser;
  const usage = currentUser?.usage;
  const usageFailed = !usage && !!(userError || userSyncError);
  const usageLoading = !usage && !usageFailed;
  // user === null is not Free — only resolve a plan when the account document loaded.
  // Limits of the real (effective) plan — five-plan or legacy — from shared-types.
  const planConfig = currentUser ? { limits: sharedPlanLimits(currentUser.subscription) } : null;
  const displayPlan = currentUser ? planForDisplay(currentUser.subscription) : null;
  const pushOn = currentUser?.preferences?.pushNotifications === true;

  const emailCopy: Record<EmailPreferenceKey, { label: string; description: string }> = {
    emailNotifications: {
      label: t('preferences.emailNotifications'),
      description: t('preferences.emailNotificationsDescription'),
    },
    marketingEmails: {
      label: t('preferences.marketingEmails'),
      description: t('preferences.marketingEmailsDescription'),
    },
  };

  const emailOn = (key: EmailPreferenceKey) =>
    emailPending[key] ?? emailPreferenceValue(currentUser?.preferences, key);

  // Saves on toggle (like the push switch) instead of the website's
  // "Save Preferences" button; same PATCH body shape, one key at a time.
  const onToggleEmail = async (key: EmailPreferenceKey, next: boolean) => {
    if (emailPending[key] !== undefined) return;
    setEmailPending((p) => ({ ...p, [key]: next }));
    try {
      await updatePreferences.mutateAsync(emailPreferencePatch(key, next));
    } catch (err) {
      Alert.alert(t('preferences.saveError'), requestFailureMessage(err, tc('pleaseTryAgain')));
    } finally {
      setEmailPending((p) => {
        const rest = { ...p };
        delete rest[key];
        return rest;
      });
    }
  };

  // Website: Settings > Preferences > Language. The profile's
  // preferences.language is the source of truth; the device keeps a copy for
  // before sign-in. Alerts after the switch use tNow, which reads the NEW
  // language (this render's `t` still holds the old one).
  const onPickLanguage = async (next: AppLocale) => {
    setLanguageOpen(false);
    if (next === locale || languageBusy) return;
    setLanguageBusy(true);
    const previous = locale;
    try {
      const { needsRestart } = await changeLanguage(next);
      if (currentUser) {
        try {
          await updatePreferences.mutateAsync({ language: next as Locale });
        } catch (err) {
          await changeLanguage(previous);
          Alert.alert(
            tNow('settings.preferences.saveError'),
            requestFailureMessage(err, tNow('common.pleaseTryAgain')),
          );
          return;
        }
      }
      if (needsRestart) {
        Alert.alert(
          tNow('settings.language.restartTitle'),
          tNow('settings.language.restartBody'),
          canReloadForDirection
            ? [
                { text: tNow('common.later'), style: 'cancel' },
                { text: tNow('settings.language.restartNow'), onPress: reloadForDirection },
              ]
            : [{ text: tNow('common.ok') }],
        );
      }
    } finally {
      setLanguageBusy(false);
    }
  };

  const sendReset = async () => {
    if (sendingReset) return;
    setSendingReset(true);
    try {
      const address = await sendPasswordResetToSelf(currentUser?.email, resetPassword);
      Alert.alert(t('password.sentTitle'), t('password.sentBody', { email: address }));
    } catch (err) {
      Alert.alert(
        t('password.failedTitle'),
        err instanceof Error && err.message ? err.message : tc('pleaseTryAgain'),
      );
    } finally {
      setSendingReset(false);
    }
  };

  // Website: "Change Password" opens a confirm, then emails a reset link to
  // the signed-in address.
  const handleChangePassword = () => {
    if (sendingReset) return;
    Alert.alert(t('password.confirmTitle'), t('password.confirmBody'), [
      { text: tc('cancel'), style: 'cancel' },
      { text: t('password.confirmAction'), onPress: () => void sendReset() },
    ]);
  };

  const runSignOutEverywhere = async () => {
    if (signingOutAll) return;
    setSigningOutAll(true);
    try {
      await signOutEverywhere({ revokeAllSessions, signOutLocally: logout });
      Alert.alert(t('signOutEverywhere.success'));
    } catch (err) {
      Alert.alert(
        t('signOutEverywhere.errorTitle'),
        requestFailureMessage(err, t('signOutEverywhere.error')),
      );
    } finally {
      setSigningOutAll(false);
    }
  };

  const handleSignOutEverywhere = () => {
    if (signingOutAll) return;
    Alert.alert(t('signOutEverywhere.confirmTitle'), t('signOutEverywhere.confirmBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: t('signOutEverywhere.confirmAction'),
        style: 'destructive',
        onPress: () => void runSignOutEverywhere(),
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert(t('signOut.confirmTitle'), t('signOut.confirmBody'), [
      { text: tc('cancel'), style: 'cancel' },
      { text: t('signOut.button'), style: 'destructive', onPress: logout },
    ]);
  };

  const onTogglePush = async (next: boolean) => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (next) {
        const result = await enablePushNotifications();
        if (result === 'permission_denied') {
          Alert.alert(t('notifications.deniedTitle'), t('notifications.deniedBody'));
        } else if (result === 'granted') {
          try {
            const jobs =
              queryClient.getQueryData<JobApplication[]>(['jobs']) ??
              (await queryClient.fetchQuery({
                queryKey: ['jobs'],
                queryFn: () => api.get<JobApplication[]>('/jobs'),
              }));
            if (jobs) await reconcileJobReminders(jobs);
          } catch {
            // Preference is on; the next successful GET /jobs will reconcile.
          }
        }
        // token_failed: enablePushNotifications already Alerted.
      } else {
        await disablePushNotifications();
        await cancelAllJobReminders();
      }
      await syncUser();
      void refetch();
    } catch {
      Alert.alert(t('notifications.updateError'), tc('pleaseTryAgain'));
    } finally {
      setPushBusy(false);
    }
  };

  const MENU_SECTIONS: { title: string; items: SettingsMenuItem[] }[] = [
    {
      title: t('sections.account'),
      items: [
        { icon: 'person-outline', label: t('menu.profile'), onPress: () => router.push('/(dashboard)/settings/profile') },
        { icon: 'briefcase-outline', label: t('menu.jobTracker'), onPress: () => router.push('../jobs') },
        ...(CAREER_ENABLED
          ? [{ icon: 'compass-outline', label: t('menu.careerTools'), onPress: () => router.push('/(dashboard)/career') }]
          : []),
        { icon: 'shield-checkmark-outline', label: t('menu.yourData'), onPress: () => router.push('/(dashboard)/settings/data') },
      ],
    },
    {
      title: t('sections.security'),
      items: [
        {
          icon: 'key-outline',
          label: sendingReset ? t('password.sending') : t('password.rowLabel'),
          description: t('password.rowDescription'),
          onPress: handleChangePassword,
          disabled: sendingReset || !currentUser?.email,
        },
        {
          icon: 'phone-portrait-outline',
          label: signingOutAll ? t('signOutEverywhere.signingOut') : t('signOutEverywhere.rowLabel'),
          description: t('signOutEverywhere.rowDescription'),
          onPress: handleSignOutEverywhere,
          disabled: signingOutAll,
        },
      ],
    },
    {
      title: t('sections.subscription'),
      items: [
        {
          icon: 'card-outline',
          label: tPlans('billingTitle'),
          onPress: () => router.push('/(dashboard)/settings/billing'),
          badge: displayPlan ? planName(displayPlan, t).toLocaleUpperCase() : undefined,
        },
        {
          icon: 'pricetags-outline',
          label: tPlans('title'),
          onPress: () => router.push('/(dashboard)/settings/plans'),
        },
      ],
    },
    {
      title: t('sections.support'),
      items: [
        { icon: 'help-circle-outline', label: t('menu.helpSupport'), onPress: () => router.push('/(dashboard)/support') },
        { icon: 'map-outline', label: t('menu.replayTour'), description: t('menu.replayTourDescription'), onPress: replayTour },
        { icon: 'document-text-outline', label: t('menu.terms'), onPress: () => void openLegalDocument('terms') },
        { icon: 'lock-closed-outline', label: t('menu.privacy'), onPress: () => void openLegalDocument('privacy') },
        { icon: 'alert-circle-outline', label: t('menu.disclaimer'), onPress: () => void openLegalDocument('disclaimer') },
        { icon: 'receipt-outline', label: t('menu.refund'), onPress: () => void openLegalDocument('refund') },
      ],
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View className="bg-surface px-5 pt-6 pb-6 border-b border-stone-100">
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/settings/profile')}
              className="flex-row items-center"
              activeOpacity={0.7}
            >
            <Avatar
              photoURL={currentUser?.photoURL}
              name={currentUser?.displayName ?? 'U'}
              size={64}
              textClassName="text-brand-700 text-xl font-black"
            />
            <View className="ms-4 flex-1">
              <Text className="text-lg font-black text-stone-900">{currentUser?.displayName ?? t('header.userFallback')}</Text>
              <Text className="text-stone-500 text-sm">{currentUser?.email}</Text>
              <View className="flex-row items-center mt-1.5">
                {!currentUser && (userError || userSyncError) ? (
                  <View className="bg-warning-bg px-2.5 py-0.5 rounded-full">
                    <Text className="text-warning text-xs font-bold">{t('header.unavailable')}</Text>
                  </View>
                ) : displayPlan ? (
                  <View className="bg-brand-100 px-2.5 py-0.5 rounded-full">
                    <Text className="text-brand-700 text-xs font-bold">{planName(displayPlan, t)}</Text>
                  </View>
                ) : (
                  <View className="bg-stone-100 px-2.5 py-0.5 rounded-full">
                    <Text className="text-stone-400 text-xs font-bold">…</Text>
                  </View>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} style={RTL_FLIP} />
            </TouchableOpacity>
        </View>

        {/* Usage Stats */}
        <View className="bg-surface mx-4 my-4 rounded-2xl border border-stone-100 p-4">
          <Text className="font-bold text-stone-800 mb-3">{t('usage.title')}</Text>
          {usageFailed ? (
            <ErrorState
              message={userError ? loadFailureMessage(userError, t, tc) : (userSyncError ?? t('usage.loadError'))}
              onRetry={() => {
                void syncUser();
                void refetch();
              }}
            />
          ) : usageLoading || !usage || !planConfig ? (
            <View>
              <View className="h-4 bg-stone-100 rounded mb-3" />
              <View className="h-4 bg-stone-100 rounded" />
            </View>
          ) : (
            <>
              <UsageBar
                label={t('usage.credits')}
                used={usage.aiCreditsUsed}
                limit={usage.aiCreditsLimit}
                color={colors.brand[600]}
              />
              <UsageBar
                label={t('usage.exports')}
                used={usage.exportsThisMonth}
                limit={typeof planConfig.limits.exports === 'number' ? planConfig.limits.exports : 999}
                color={colors.brand[600]}
                unlimited={planConfig.limits.exports === 'unlimited'}
              />
            </>
          )}
        </View>

        <View className="bg-surface mx-4 mb-4 rounded-2xl border border-stone-100 px-4 py-3 flex-row items-center">
          <View className="w-8 h-8 rounded-xl bg-stone-100 items-center justify-center me-3">
            <Ionicons name="notifications-outline" size={18} color={colors.stone[500]} />
          </View>
          <View className="flex-1 me-3">
            <Text className="text-stone-800 font-medium">{t('notifications.title')}</Text>
            <Text className="text-stone-500 text-xs mt-0.5">
              {t('notifications.description')}
            </Text>
          </View>
          <Switch
            value={pushOn}
            disabled={pushBusy}
            onValueChange={(v) => void onTogglePush(v)}
            trackColor={{ true: colors.brand[600] }}
            accessibilityLabel={t('notifications.title')}
          />
        </View>

        {/* Email preferences — website Settings > Preferences */}
        <View className="bg-surface mx-4 mb-4 rounded-2xl border border-stone-100 overflow-hidden">
          {EMAIL_PREFERENCE_KEYS.map((key, index) => (
            <View
              key={key}
              className={['px-4 py-3 flex-row items-center', index > 0 ? 'border-t border-stone-50' : ''].join(' ')}
            >
              <View className="w-8 h-8 rounded-xl bg-stone-100 items-center justify-center me-3">
                <Ionicons
                  name={key === 'emailNotifications' ? 'mail-outline' : 'megaphone-outline'}
                  size={18}
                  color={colors.stone[500]}
                />
              </View>
              <View className="flex-1 me-3">
                <Text className="text-stone-800 font-medium">{emailCopy[key].label}</Text>
                <Text className="text-stone-500 text-xs mt-0.5">{emailCopy[key].description}</Text>
              </View>
              <Switch
                value={emailOn(key)}
                disabled={!currentUser || emailPending[key] !== undefined}
                onValueChange={(v) => void onToggleEmail(key, v)}
                trackColor={{ true: colors.brand[600] }}
                accessibilityLabel={emailCopy[key].label}
                accessibilityHint={emailCopy[key].description}
              />
            </View>
          ))}
        </View>

        {/* Language — website Settings > Preferences > Language */}
        <View className="bg-surface mx-4 mb-4 rounded-2xl border border-stone-100 overflow-hidden">
          <TouchableOpacity
            onPress={() => setLanguageOpen(true)}
            disabled={languageBusy}
            className={['px-4 py-3 flex-row items-center', languageBusy ? 'opacity-60' : ''].join(' ')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${t('language.title')}: ${LANGUAGE_NAMES[locale]}`}
            accessibilityHint={t('language.description')}
            accessibilityState={{ disabled: languageBusy }}
          >
            <View className="w-8 h-8 rounded-xl bg-stone-100 items-center justify-center me-3">
              <Ionicons name="language-outline" size={18} color={colors.stone[500]} />
            </View>
            <View className="flex-1 me-3">
              <Text className="text-stone-800 font-medium">{t('language.title')}</Text>
              <Text className="text-stone-500 text-xs mt-0.5">{t('language.description')}</Text>
            </View>
            <Text className="text-stone-600 text-sm me-2">{LANGUAGE_NAMES[locale]}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.stone[300]} style={RTL_FLIP} />
          </TouchableOpacity>
        </View>

        {/* Menu Sections */}
        {MENU_SECTIONS.map((section) => (
          <View key={section.title} className="mx-4 mb-4">
            <Text className="text-xs font-semibold text-stone-400 uppercase tracking-wide px-1 mb-2">
              {section.title}
            </Text>
            <View className="bg-surface rounded-2xl border border-stone-100 overflow-hidden">
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.label}
                  onPress={item.onPress}
                  disabled={item.disabled}
                  className={[
                    'flex-row items-center px-4 py-4',
                    index > 0 ? 'border-t border-stone-50' : '',
                    item.disabled ? 'opacity-60' : '',
                  ].join(' ')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                  accessibilityHint={item.description}
                  accessibilityState={{ disabled: !!item.disabled }}
                >
                  <View className="w-8 h-8 rounded-xl bg-stone-100 items-center justify-center me-3">
                    <Ionicons name={item.icon as any} size={18} color={colors.stone[500]} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-stone-800 font-medium">{item.label}</Text>
                    {item.description ? (
                      <Text className="text-stone-500 text-xs mt-0.5">{item.description}</Text>
                    ) : null}
                  </View>
                  {item.badge && (
                    <View className="bg-brand-100 px-2 py-0.5 rounded-full me-2">
                      <Text className="text-brand-600 text-xs font-bold">{item.badge}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={colors.stone[300]} style={RTL_FLIP} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Sign Out */}
        <View className="mx-4 mb-8">
          <TouchableOpacity
            onPress={handleLogout}
            className="bg-error-bg border border-red-100 rounded-2xl p-4 flex-row items-center justify-center"
          >
            <Ionicons name="log-out-outline" size={20} color={colors.error.DEFAULT} style={RTL_FLIP} />
            <Text className="text-error font-semibold ms-2">{t('signOut.button')}</Text>
          </TouchableOpacity>
          <Text className="text-center text-stone-300 text-xs mt-3">
            FlacronCV v1.0.0
          </Text>
        </View>
      </ScrollView>

      <Modal visible={languageOpen} onClose={() => setLanguageOpen(false)} title={t('language.title')}>
        {SUPPORTED_LOCALES.map((option) => {
          const selected = option === locale;
          return (
            <TouchableOpacity
              key={option}
              onPress={() => void onPickLanguage(option)}
              className="flex-row items-center py-3.5 border-b border-stone-100"
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={LANGUAGE_NAMES[option]}
            >
              {/* Each name is in its own script; writingDirection keeps ar/ur readable in an LTR layout. */}
              <Text
                className={['flex-1 text-base', selected ? 'text-brand-700 font-bold' : 'text-stone-800'].join(' ')}
                style={{ writingDirection: isRTLLocale(option) ? 'rtl' : 'ltr' }}
              >
                {LANGUAGE_NAMES[option]}
              </Text>
              {selected ? <Ionicons name="checkmark" size={20} color={colors.brand[600]} /> : null}
            </TouchableOpacity>
          );
        })}
      </Modal>
    </SafeAreaView>
  );
}

function UsageBar({ label, used, limit, color, unlimited = false }: {
  label: string; used: number; limit: number; color: string; unlimited?: boolean;
}) {
  const percent = unlimited ? 10 : Math.min((used / Math.max(limit, 1)) * 100, 100);
  return (
    <View className="mb-3">
      <View className="flex-row justify-between mb-1">
        <Text className="text-sm text-stone-600">{label}</Text>
        <Text className="text-sm font-semibold text-stone-700">
          {used} / {unlimited ? '∞' : limit}
        </Text>
      </View>
      <View className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <View className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
      </View>
    </View>
  );
}
