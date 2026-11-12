import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { CAREER_ENABLED } from '../../../src/config/career';
import { CareerErasureNeedsFreshSignIn, deleteAccountEverywhere } from '../../../src/lib/account-deletion';
import { api, apiClient } from '../../../src/lib/api';
import { requestFailureMessage } from '../../../src/lib/api-errors';
import { careerApi, freshIdToken } from '../../../src/lib/career-api';
import { shareTextFile } from '../../../src/lib/career-files';
import { useAuthStore } from '../../../src/store/auth-store';
import { colors } from '../../../src/theme/colors';

/**
 * Your data: download a copy (same export as the website) and delete the
 * account in the app (App Store guideline 5.1.1(v)). Deletion uses the same
 * server path as the website, so billing is cancelled and career data erased.
 */
export default function AccountDataScreen() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

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
      if (outcome === 'sharing_unavailable') Alert.alert('Sharing unavailable', 'This device cannot open the share sheet.');
    } catch (error) {
      Alert.alert('Download failed', requestFailureMessage(error, 'Could not prepare your data. Please try again.'));
    } finally {
      setExporting(false);
    }
  };

  const onDelete = () => {
    if (confirmText.trim() !== 'DELETE' || deleting) return;
    Alert.alert('Delete your account?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteAccountEverywhere({
              careerEnabled: CAREER_ENABLED,
              careerApi,
              freshIdToken,
              deleteV1Account: () => api.delete('/users/me'),
              signOutLocally: logout,
            });
            router.replace('/(auth)/login');
            Alert.alert('Account deleted', 'Your account has been deleted and you are signed out.');
          } catch (error) {
            if (error instanceof CareerErasureNeedsFreshSignIn) {
              Alert.alert('Sign in again', 'For your security, sign out, sign in again and then delete your account. Nothing was deleted.');
            } else {
              Alert.alert('Not deleted', requestFailureMessage(error, 'Your account was not deleted. Please try again.'));
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
      <CareerHeader title="Your data" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View className="bg-white rounded-2xl border border-stone-100 p-5">
            <Text className="font-bold text-stone-900 text-base">Download your data</Text>
            <Text className="text-stone-500 text-sm mt-1 leading-5">
              A copy of your account, CVs, cover letters and job applications as a JSON file. The file is shared from a temporary copy that is removed afterwards.
              {CAREER_ENABLED ? ' Career-tool data is exported separately from Career tools > Career data.' : ''}
            </Text>
            <View className="mt-4 self-start">
              <Button variant="outline" onPress={() => void onDownload()} loading={exporting}>
                Download my data
              </Button>
            </View>
          </View>

          <View className="bg-white rounded-2xl border border-red-100 p-5 mt-4">
            <Text className="font-bold text-red-700 text-base">Delete account</Text>
            <Text className="text-stone-600 text-sm mt-1 leading-5">
              Your account is closed and you are signed out. Paid subscriptions bought on the website, including a career add-on, are cancelled.
              {CAREER_ENABLED ? ' Your career-tool data is erased.' : ''} Subscriptions bought through the App Store or Google Play must be cancelled in the store.
            </Text>
            <Text className="text-stone-700 text-sm mt-4 font-semibold">Type DELETE to confirm</Text>
            <TextInput
              value={confirmText}
              onChangeText={setConfirmText}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Type DELETE to confirm"
              className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 mt-2 text-base text-stone-900"
              placeholder="DELETE"
              placeholderTextColor={colors.stone[400]}
            />
            <View className="mt-4 self-start">
              <Button variant="danger" onPress={onDelete} loading={deleting} disabled={confirmText.trim() !== 'DELETE'}>
                Delete my account
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
