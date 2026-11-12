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
  EMAIL_PREFERENCES,
  EmailPreferenceKey,
  PASSWORD_COPY,
  PREFERENCES_SAVE_ERROR,
  SIGN_OUT_EVERYWHERE_COPY,
  emailPreferencePatch,
  emailPreferenceValue,
  sendPasswordResetToSelf,
  signOutEverywhere,
} from '../../../src/lib/account-settings';
import { requestFailureMessage } from '../../../src/lib/api-errors';
import { effectivePlanForCopy } from '../../../src/lib/entitlements';
import { PLAN_CONFIGS } from '../../../src/types/subscription.types';
import { JobApplication } from '../../../src/types/job.types';
import { openLegalDocument } from '../../../src/lib/legal-acceptance';
import { PAID_UPGRADES_ENABLED } from '../../../src/config/paid-upgrades';
import { CAREER_ENABLED } from '../../../src/config/career';
import { Avatar } from '../../../src/components/ui/Avatar';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { colors } from '../../../src/theme/colors';
import { api } from '../../../src/lib/api';
import { cancelAllJobReminders, reconcileJobReminders } from '../../../src/lib/job-reminders';
import { disablePushNotifications, enablePushNotifications } from '../../../src/lib/push';
import { useAppTourReplay } from '../../../src/hooks/useAppTour';

type SettingsMenuItem = {
  icon: string;
  label: string;
  onPress: () => void;
  badge?: string;
  description?: string;
  disabled?: boolean;
};

function loadFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return 'No connection. Check your network and try again.';
  }
  return 'Could not load usage. Please try again.';
}

export default function SettingsScreen() {
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

  const currentUser = user ?? authUser;
  const usage = currentUser?.usage;
  const usageFailed = !usage && !!(userError || userSyncError);
  const usageLoading = !usage && !usageFailed;
  // user === null is not Free — only resolve a plan when the account document loaded.
  const plan = currentUser ? effectivePlanForCopy(currentUser.subscription) : null;
  const planConfig = plan ? PLAN_CONFIGS[plan] : null;
  const pushOn = currentUser?.preferences?.pushNotifications === true;

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
      Alert.alert(PREFERENCES_SAVE_ERROR, requestFailureMessage(err, 'Please try again.'));
    } finally {
      setEmailPending((p) => {
        const rest = { ...p };
        delete rest[key];
        return rest;
      });
    }
  };

  const sendReset = async () => {
    if (sendingReset) return;
    setSendingReset(true);
    try {
      const address = await sendPasswordResetToSelf(currentUser?.email, resetPassword);
      Alert.alert(PASSWORD_COPY.sentTitle, PASSWORD_COPY.sentBody(address));
    } catch (err) {
      Alert.alert(
        PASSWORD_COPY.failedTitle,
        err instanceof Error && err.message ? err.message : 'Please try again.',
      );
    } finally {
      setSendingReset(false);
    }
  };

  // Website: "Change Password" opens a confirm, then emails a reset link to
  // the signed-in address.
  const handleChangePassword = () => {
    if (sendingReset) return;
    Alert.alert(PASSWORD_COPY.confirmTitle, PASSWORD_COPY.confirmBody, [
      { text: 'Cancel', style: 'cancel' },
      { text: PASSWORD_COPY.confirmAction, onPress: () => void sendReset() },
    ]);
  };

  const runSignOutEverywhere = async () => {
    if (signingOutAll) return;
    setSigningOutAll(true);
    try {
      await signOutEverywhere({ revokeAllSessions, signOutLocally: logout });
      Alert.alert(SIGN_OUT_EVERYWHERE_COPY.success);
    } catch (err) {
      Alert.alert(
        SIGN_OUT_EVERYWHERE_COPY.errorTitle,
        requestFailureMessage(err, SIGN_OUT_EVERYWHERE_COPY.error),
      );
    } finally {
      setSigningOutAll(false);
    }
  };

  const handleSignOutEverywhere = () => {
    if (signingOutAll) return;
    Alert.alert(SIGN_OUT_EVERYWHERE_COPY.confirmTitle, SIGN_OUT_EVERYWHERE_COPY.confirmBody, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: SIGN_OUT_EVERYWHERE_COPY.confirmAction,
        style: 'destructive',
        onPress: () => void runSignOutEverywhere(),
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  const onTogglePush = async (next: boolean) => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (next) {
        const result = await enablePushNotifications();
        if (result === 'permission_denied') {
          Alert.alert(
            'Notifications are off',
            'You can enable them later from system Settings, or from here.',
          );
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
      Alert.alert('Could not update notifications', 'Please try again.');
    } finally {
      setPushBusy(false);
    }
  };

  const MENU_SECTIONS: { title: string; items: SettingsMenuItem[] }[] = [
    {
      title: 'Account',
      items: [
        { icon: 'person-outline', label: 'Profile', onPress: () => router.push('/(dashboard)/settings/profile') },
        { icon: 'briefcase-outline', label: 'Job Tracker', onPress: () => router.push('../jobs') },
        ...(CAREER_ENABLED
          ? [{ icon: 'compass-outline', label: 'Career tools', onPress: () => router.push('/(dashboard)/career') }]
          : []),
        { icon: 'shield-checkmark-outline', label: 'Your data & account deletion', onPress: () => router.push('/(dashboard)/settings/data') },
      ],
    },
    {
      title: 'Security',
      items: [
        {
          icon: 'key-outline',
          label: sendingReset ? 'Sending…' : PASSWORD_COPY.rowLabel,
          description: PASSWORD_COPY.rowDescription,
          onPress: handleChangePassword,
          disabled: sendingReset || !currentUser?.email,
        },
        {
          icon: 'phone-portrait-outline',
          label: signingOutAll ? 'Signing out…' : SIGN_OUT_EVERYWHERE_COPY.rowLabel,
          description: SIGN_OUT_EVERYWHERE_COPY.rowDescription,
          onPress: handleSignOutEverywhere,
          disabled: signingOutAll,
        },
      ],
    },
    {
      title: 'Subscription',
      items: [
        { icon: 'card-outline', label: PAID_UPGRADES_ENABLED ? 'Billing & Plans' : 'Plan & usage', onPress: () => router.push('/(dashboard)/settings/billing'), badge: planConfig ? planConfig.plan.toUpperCase() : undefined },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: 'help-circle-outline', label: 'Help & Support', onPress: () => router.push('/(dashboard)/support') },
        { icon: 'map-outline', label: 'Replay App Tour', description: 'Walk through the main parts of FlacronCV again.', onPress: replayTour },
        { icon: 'document-text-outline', label: 'Terms of Service', onPress: () => void openLegalDocument('terms') },
        { icon: 'lock-closed-outline', label: 'Privacy Policy', onPress: () => void openLegalDocument('privacy') },
        { icon: 'alert-circle-outline', label: 'Disclaimer', onPress: () => void openLegalDocument('disclaimer') },
        { icon: 'receipt-outline', label: 'Refund Policy', onPress: () => void openLegalDocument('refund') },
      ],
    },
  ];

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View className="bg-white px-5 pt-6 pb-6 border-b border-stone-100">
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
            <View className="ml-4 flex-1">
              <Text className="text-lg font-black text-stone-900">{currentUser?.displayName ?? 'User'}</Text>
              <Text className="text-stone-500 text-sm">{currentUser?.email}</Text>
              <View className="flex-row items-center mt-1.5">
                {!currentUser && (userError || userSyncError) ? (
                  <View className="bg-warning-bg px-2.5 py-0.5 rounded-full">
                    <Text className="text-warning text-xs font-bold">Unavailable</Text>
                  </View>
                ) : plan ? (
                  <View className="bg-brand-100 px-2.5 py-0.5 rounded-full">
                    <Text className="text-brand-700 text-xs font-bold capitalize">{plan}</Text>
                  </View>
                ) : (
                  <View className="bg-stone-100 px-2.5 py-0.5 rounded-full">
                    <Text className="text-stone-400 text-xs font-bold">…</Text>
                  </View>
                )}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} />
            </TouchableOpacity>
        </View>

        {/* Usage Stats */}
        <View className="bg-white mx-4 my-4 rounded-2xl border border-stone-100 p-4">
          <Text className="font-bold text-stone-800 mb-3">Monthly Usage</Text>
          {usageFailed ? (
            <ErrorState
              message={userError ? loadFailureMessage(userError) : (userSyncError ?? 'Could not load usage. Please try again.')}
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
                label="Credits"
                used={usage.aiCreditsUsed}
                limit={usage.aiCreditsLimit}
                color={colors.brand[600]}
              />
              <UsageBar
                label="Exports"
                used={usage.exportsThisMonth}
                limit={typeof planConfig.limits.exports === 'number' ? planConfig.limits.exports : 999}
                color={colors.brand[600]}
                unlimited={planConfig.limits.exports === 'unlimited'}
              />
            </>
          )}
        </View>

        <View className="bg-white mx-4 mb-4 rounded-2xl border border-stone-100 px-4 py-3 flex-row items-center">
          <View className="w-8 h-8 rounded-xl bg-stone-100 items-center justify-center mr-3">
            <Ionicons name="notifications-outline" size={18} color={colors.stone[500]} />
          </View>
          <View className="flex-1 mr-3">
            <Text className="text-stone-800 font-medium">Notifications</Text>
            <Text className="text-stone-500 text-xs mt-0.5">
              Follow-up reminders and account alerts
            </Text>
          </View>
          <Switch
            value={pushOn}
            disabled={pushBusy}
            onValueChange={(v) => void onTogglePush(v)}
            trackColor={{ true: colors.brand[600] }}
            accessibilityLabel="Notifications"
          />
        </View>

        {/* Email preferences — website Settings > Preferences */}
        <View className="bg-white mx-4 mb-4 rounded-2xl border border-stone-100 overflow-hidden">
          {EMAIL_PREFERENCES.map((pref, index) => (
            <View
              key={pref.key}
              className={['px-4 py-3 flex-row items-center', index > 0 ? 'border-t border-stone-50' : ''].join(' ')}
            >
              <View className="w-8 h-8 rounded-xl bg-stone-100 items-center justify-center mr-3">
                <Ionicons
                  name={pref.key === 'emailNotifications' ? 'mail-outline' : 'megaphone-outline'}
                  size={18}
                  color={colors.stone[500]}
                />
              </View>
              <View className="flex-1 mr-3">
                <Text className="text-stone-800 font-medium">{pref.label}</Text>
                <Text className="text-stone-500 text-xs mt-0.5">{pref.description}</Text>
              </View>
              <Switch
                value={emailOn(pref.key)}
                disabled={!currentUser || emailPending[pref.key] !== undefined}
                onValueChange={(v) => void onToggleEmail(pref.key, v)}
                trackColor={{ true: colors.brand[600] }}
                accessibilityLabel={pref.label}
                accessibilityHint={pref.description}
              />
            </View>
          ))}
        </View>

        {/* Menu Sections */}
        {MENU_SECTIONS.map((section) => (
          <View key={section.title} className="mx-4 mb-4">
            <Text className="text-xs font-semibold text-stone-400 uppercase tracking-wide px-1 mb-2">
              {section.title}
            </Text>
            <View className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
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
                  <View className="w-8 h-8 rounded-xl bg-stone-100 items-center justify-center mr-3">
                    <Ionicons name={item.icon as any} size={18} color={colors.stone[500]} />
                  </View>
                  <View className="flex-1">
                    <Text className="text-stone-800 font-medium">{item.label}</Text>
                    {item.description ? (
                      <Text className="text-stone-500 text-xs mt-0.5">{item.description}</Text>
                    ) : null}
                  </View>
                  {item.badge && (
                    <View className="bg-brand-100 px-2 py-0.5 rounded-full mr-2">
                      <Text className="text-brand-600 text-xs font-bold">{item.badge}</Text>
                    </View>
                  )}
                  <Ionicons name="chevron-forward" size={16} color={colors.stone[300]} />
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
            <Ionicons name="log-out-outline" size={20} color={colors.error.DEFAULT} />
            <Text className="text-error font-semibold ml-2">Sign Out</Text>
          </TouchableOpacity>
          <Text className="text-center text-stone-300 text-xs mt-3">
            FlacronCV v1.0.0
          </Text>
        </View>
      </ScrollView>
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
