import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';
import { t } from '../i18n';
import { getFirebaseAuth } from './firebase';
import { legalDocUrl } from './legal-docs';

export { AI_CONSENT_DECLINED, AiConsentDeclinedError, isCareerAiRequest, isV1AiRequest } from './ai-consent-rules';

/**
 * Permission before personal content is shared with a third-party AI provider
 * (App Store guideline 5.1.2(i)): names the provider, says what is sent, and
 * nothing is sent for AI until the person allows it. Asked once per account on
 * this device, enforced at the two network clients (lib/api.ts and
 * lib/career-api.ts) so no AI button can skip it, and withdrawn in Settings >
 * Your data.
 */
const key = (uid: string) => `flacroncv_ai_consent_v1:${uid}`;

function currentUid(): string | null {
  return getFirebaseAuth().currentUser?.uid ?? null;
}

export async function hasAiConsent(): Promise<boolean> {
  const uid = currentUid();
  if (!uid) return false;
  try {
    return (await AsyncStorage.getItem(key(uid))) === 'granted';
  } catch {
    return false;
  }
}

export async function setAiConsent(granted: boolean): Promise<void> {
  const uid = currentUid();
  if (!uid) return;
  if (granted) await AsyncStorage.setItem(key(uid), 'granted');
  else await AsyncStorage.removeItem(key(uid));
}

function ask(): Promise<boolean> {
  return new Promise((resolve) => {
    const show = () =>
      Alert.alert(
        t('common.aiConsent.title'),
        t('common.aiConsent.body'),
        [
          {
            text: t('common.aiConsent.privacy'),
            onPress: () => {
              const url = legalDocUrl('privacy');
              // Reading the policy is not an answer: ask again afterwards.
              if (!url) return show();
              void WebBrowser.openBrowserAsync(url).catch(() => undefined).then(show);
            },
          },
          { text: t('common.aiConsent.notNow'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('common.aiConsent.allow'), onPress: () => resolve(true) },
        ],
        { cancelable: false },
      );
    show();
  });
}

let pending: Promise<boolean> | null = null;

/** True when allowed (asking if needed). Parallel AI calls share one prompt. */
export async function ensureAiConsent(): Promise<boolean> {
  // Signed out: the API refuses the call anyway, nothing is sent on.
  if (!currentUid()) return true;
  if (await hasAiConsent()) return true;
  pending ??= ask()
    .then(async (granted) => {
      if (granted) await setAiConsent(true);
      return granted;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}
