import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { CAREER_ENABLED } from '../../../src/config/career';
import { CareerErasureNeedsFreshSignIn, deleteAccountEverywhere } from '../../../src/lib/account-deletion';
import { hasAiConsent, setAiConsent } from '../../../src/lib/ai-consent';
import { api, apiClient } from '../../../src/lib/api';
import { AppleConfirmationCancelled, revokeAppleAccess } from '../../../src/lib/apple-revoke';
import { requestFailureMessage } from '../../../src/lib/api-errors';
import { careerApi, freshIdToken } from '../../../src/lib/career-api';
import { shareTextFile } from '../../../src/lib/career-files';
import { useAuthStore } from '../../../src/store/auth-store';
import { colors } from '../../../src/theme/colors';
import { t as tNow, useT } from '../../../src/i18n';

/**
 * Your data: download a copy (same export as the website) and delete the
 * account in the app (App Store guideline 5.1.1(v)). Deletion uses the same
 * server path as the website, so billing is cancelled and career data erased.
 */
export default function AccountDataScreen() {
  const t = useT('settings.data');
  const tc = useT('common');
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [aiAllowed, setAiAllowed] = useState(false);
  useEffect(() => {
    void hasAiConsent().then(setAiAllowed);
  }, []);
  const onAiChange = (next: boolean) => {
    setAiAllowed(next);
    void setAiConsent(next);
  };
  // The website localises the confirmation word (settings.account.deleteKeyword).
  const keyword = t('keyword');
  const confirmed = confirmText.trim() === keyword;

  const onDownload = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      // The export fans out across several collections server-side, like the website's 60 s budget.
      const response = await apiClient.get('/users/me/export', { timeout: 60000 });
      const data = (response.data && typeof response.data === 'object' && 'data' in response.data ? response.data.data : response.data) as unknown;
      const outcome = await shareTextFile(
        JSON.stringify(data, null, 2),
        `flacroncv-data-${new Date().toISOString().slice(0, 10)}.json`,
        'application/json',
      );
      if (outcome === 'sharing_unavailable') Alert.alert(t('sharingUnavailableTitle'), t('sharingUnavailableBody'));
    } catch (error) {
      Alert.alert(t('downloadFailedTitle'), requestFailureMessage(error, t('downloadError')));
    } finally {
      setExporting(false);
    }
  };

  const onDelete = () => {
    if (!confirmed || deleting) return;
    Alert.alert(t('confirmTitle'), t('confirmBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            // Apple accounts: cancel Apple's access first, while the account still exists.
            await revokeAppleAccess();
            await deleteAccountEverywhere({
              careerEnabled: CAREER_ENABLED,
              careerApi,
              freshIdToken,
              deleteV1Account: () => api.delete('/users/me'),
              signOutLocally: logout,
            });
            router.replace('/(auth)/login');
            Alert.alert(tNow('settings.data.deletedTitle'), tNow('settings.data.deletedBody'));
          } catch (error) {
            if (error instanceof AppleConfirmationCancelled) {
              Alert.alert(tNow('settings.data.notDeletedTitle'), tNow('settings.data.appleCancelled'));
            } else if (error instanceof CareerErasureNeedsFreshSignIn) {
              Alert.alert(tNow('settings.data.signInAgainTitle'), tNow('settings.data.signInAgainBody'));
            } else {
              Alert.alert(tNow('settings.data.notDeletedTitle'), requestFailureMessage(error, tNow('settings.data.notDeletedError')));
            }
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('title')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View className="bg-surface rounded-2xl border border-stone-100 p-5">
            <Text className="font-bold text-stone-900 text-base">{t('downloadTitle')}</Text>
            <Text className="text-stone-500 text-sm mt-1 leading-5">
              {[t('downloadBody'), CAREER_ENABLED ? t('downloadCareerNote') : null].filter(Boolean).join(' ')}
            </Text>
            <View className="mt-4 self-start">
              <Button variant="outline" onPress={() => void onDownload()} loading={exporting}>
                {t('downloadButton')}
              </Button>
            </View>
          </View>

          <View className="bg-surface rounded-2xl border border-stone-100 p-5 mt-4">
            <View className="flex-row items-center">
              <Text className="flex-1 me-3 font-bold text-stone-900 text-base">{t('aiTitle')}</Text>
              <Switch value={aiAllowed} onValueChange={onAiChange} accessibilityLabel={t('aiTitle')} trackColor={{ true: colors.brand[600] }} />
            </View>
            <Text className="text-stone-600 text-sm mt-1 leading-5">{t('aiBody')}</Text>
          </View>

          <View className="bg-surface rounded-2xl border border-red-100 p-5 mt-4">
            <Text className="font-bold text-red-700 text-base">{t('deleteTitle')}</Text>
            <Text className="text-stone-600 text-sm mt-1 leading-5">
              {[t('deleteBody'), CAREER_ENABLED ? t('deleteCareerNote') : null, t('deleteStoreNote')].filter(Boolean).join(' ')}
            </Text>
            <Text className="text-stone-700 text-sm mt-4 font-semibold">{t('confirmLabel', { keyword })}</Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel={t('confirmLabel', { keyword })}
              className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mt-2 text-base text-stone-900"
              placeholder={keyword}
              placeholderTextColor={colors.stone[400]}
            />
            <View className="mt-4 self-start">
              <Button variant="danger" onPress={onDelete} loading={deleting} disabled={!confirmed}>
                {t('deleteButton')}
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
