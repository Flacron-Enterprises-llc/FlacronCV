import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { useCareerExport } from '../../../src/hooks/career/data';
import { EXPORT_FAILED, exportErrorMessage } from '../../../src/lib/career/data';
import { colors } from '../../../src/theme/colors';

/**
 * Career data (website: /career/data). Export prepares a JSON file of every
 * career record and file held for you and opens the share sheet. Like the
 * website, it works whatever the plan. Erasing data is part of account
 * deletion in Settings › Your data, so it is linked rather than repeated here.
 */
export default function CareerDataScreen() {
  const router = useRouter();
  const exporter = useCareerExport();
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const onExport = () => {
    if (exporter.isPending) return;
    setNote(null);
    setLink(null);
    exporter.mutate(undefined, {
      onSuccess: (result) => {
        if (result.kind === 'shared') {
          setNote({ tone: 'success', text: 'Your career data file is ready. The temporary copy on this device was removed.' });
        } else if (result.kind === 'failed') {
          setNote({ tone: 'error', text: EXPORT_FAILED });
        } else {
          setLink(result.url);
          setNote({
            tone: 'error',
            text:
              result.reason === 'sharing_unavailable'
                ? 'This device cannot open the share sheet. Open the download link instead; it expires after a short time.'
                : 'The file is ready but could not be downloaded in the app. Open the download link instead; it expires after a short time.',
          });
        }
      },
      onError: (error) => setNote({ tone: 'error', text: exportErrorMessage(error) }),
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Career data" />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="text-stone-500 text-sm leading-5 mb-4">
          This page covers only the career tools: your career profile, evidence files, drafts, practice sessions and other career records. Your FlacronCV account, CVs, cover letters, job tracker and subscription are managed in Settings.
        </Text>

        <View className="bg-white rounded-2xl border border-stone-100 p-5">
          <Text className="font-bold text-stone-900 text-base">Export career data</Text>
          <Text className="text-stone-500 text-sm mt-1 leading-5">
            A copy of every career record and file we hold for you, as a JSON file. It is shared from a temporary copy that is removed afterwards. Preparing it can take up to half a minute.
          </Text>
          <View className="mt-4 self-start">
            <Button variant="outline" onPress={onExport} loading={exporter.isPending} accessibilityLabel="Prepare career data export">
              Prepare export
            </Button>
          </View>
          {exporter.isPending ? <Text className="text-stone-400 text-xs mt-2">Preparing your export…</Text> : null}
          {note ? (
            <View
              className={`rounded-xl border p-3 mt-4 ${note.tone === 'success' ? 'bg-success-bg border-green-200' : 'bg-red-50 border-red-200'}`}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
            >
              <Text className={`text-sm ${note.tone === 'success' ? 'text-success' : 'text-red-700'}`}>{note.text}</Text>
            </View>
          ) : null}
          {link ? (
            <View className="mt-3 self-start">
              <Button variant="ghost" onPress={() => void Linking.openURL(link)} accessibilityLabel="Open download link">
                Open download link
              </Button>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/settings/data' as Href)}
          className="bg-white rounded-2xl border border-stone-100 p-5 mt-4 flex-row items-center"
          accessibilityRole="link"
          accessibilityLabel="Erase career data: open account deletion in Settings"
        >
          <View className="flex-1 mr-3">
            <Text className="font-bold text-stone-900 text-base">Erase career data</Text>
            <Text className="text-stone-500 text-sm mt-1 leading-5">
              Deleting your account in Settings › Your data also erases all career data.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.stone[400]} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
