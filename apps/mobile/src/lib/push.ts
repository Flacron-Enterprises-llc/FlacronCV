import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { useAuthStore } from '../store/auth-store';
import { api } from './api';

const PROMPTED_KEY = 'flacroncv_push_permission_prompted';

export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}

export async function markPushPrompted(): Promise<void> {
  await AsyncStorage.setItem(PROMPTED_KEY, '1');
}

async function wasPushPrompted(): Promise<boolean> {
  return (await AsyncStorage.getItem(PROMPTED_KEY)) === '1';
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function currentExpoPushToken(): Promise<string | null> {
  if (isExpoGo()) return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  await ensureAndroidChannel();
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/** Register this install's token. No-ops in Expo Go (remote push unavailable). */
export async function registerExpoPushToken(): Promise<void> {
  try {
    const token = await currentExpoPushToken();
    if (!token) return;
    await api.post('/users/me/push-tokens', { token });
  } catch {
    // Token registration must never fail the calling flow.
  }
}

export async function unregisterExpoPushToken(): Promise<void> {
  try {
    const token = await currentExpoPushToken();
    if (!token) return;
    await api.delete('/users/me/push-tokens', { token });
  } catch {
    // Preference is already off; token cleanup is best-effort.
  }
}

/** Request OS permission, register token when possible, persist the opt-in. */
export async function enablePushNotifications(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  await markPushPrompted();
  if (status !== 'granted') return false;
  await registerExpoPushToken();
  await api.patch('/users/me/preferences', { pushNotifications: true });
  return true;
}

export async function disablePushNotifications(): Promise<void> {
  await api.patch('/users/me/preferences', { pushNotifications: false });
  await unregisterExpoPushToken();
}

export type PushPromptResult = 'already' | 'granted' | 'declined';

export type ReminderPromptDates = {
  followUp: boolean;
  interview: boolean;
};

/** Hardcoded English — Job Tracker has no t(). */
export function pushReminderPromptMessage(dates: ReminderPromptDates): string {
  if (dates.followUp && dates.interview) {
    return 'Turn on notifications so we can remind you when this follow-up or interview is due.';
  }
  if (dates.interview) {
    return 'Turn on notifications so we can remind you when this interview is due.';
  }
  return 'Turn on notifications so we can remind you when this follow-up is due.';
}

/**
 * One educational prompt, then the system dialog. Call after a successful
 * job save that includes a follow-up or interview date — never at launch.
 * `granted` means they just opted in (schedule immediately).
 */
export function maybeAskPushAfterFollowUpSave(
  dates: ReminderPromptDates,
  onDone: (result: PushPromptResult) => void,
): void {
  void (async () => {
    try {
      if (await wasPushPrompted()) {
        onDone('already');
        return;
      }
      Alert.alert(
        'Get a reminder?',
        pushReminderPromptMessage(dates),
        [
          {
            text: 'Not now',
            style: 'cancel',
            onPress: () => {
              void markPushPrompted().finally(() => onDone('declined'));
            },
          },
          {
            text: 'Enable',
            onPress: () => {
              void enablePushNotifications()
                .then(async (ok) => {
                  if (!ok) {
                    onDone('declined');
                    return;
                  }
                  try {
                    await useAuthStore.getState().syncUser();
                  } catch {
                    // Preference is already on the server; store may stay stale.
                  }
                  onDone('granted');
                })
                .catch(() => onDone('declined'));
            },
          },
        ],
      );
    } catch {
      onDone('declined');
    }
  })();
}
