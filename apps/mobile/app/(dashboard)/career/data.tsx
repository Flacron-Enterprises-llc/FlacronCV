import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { useCareerExport } from '../../../src/hooks/career/data';
import { exportErrorMessage, exportFailedMessage } from '../../../src/lib/career/data';
import { colors } from '../../../src/theme/colors';
import { useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';

/**
 * Career data (website: /career/data). Export prepares a JSON file of every
 * career record and file held for you and opens the share sheet. Like the
 * website, it works whatever the plan. Erasing data is part of account
 * deletion in Settings › Your data, so it is linked rather than repeated here.
 */
export default function CareerDataScreen() {
  const t = useT('careerModes.data');
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
          setNote({ tone: 'success', text: t('export.shared') });
        } else if (result.kind === 'failed') {
          setNote({ tone: 'error', text: exportFailedMessage() });
        } else {
          setLink(result.url);
          setNote({
            tone: 'error',
            text:
              result.reason === 'sharing_unavailable'
                ? t('export.sharingUnavailable')
                : t('export.downloadFailed'),
          });
        }
      },
      onError: (error) => setNote({ tone: 'error', text: exportErrorMessage(error) }),
    });
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('title')} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="text-stone-500 text-sm leading-5 mb-4">{t('intro')}</Text>

        <View className="bg-white rounded-2xl border border-stone-100 p-5">
          <Text className="font-bold text-stone-900 text-base">{t('export.title')}</Text>
          <Text className="text-stone-500 text-sm mt-1 leading-5">{t('export.body')}</Text>
          <View className="mt-4 self-start">
            <Button variant="outline" onPress={onExport} loading={exporter.isPending} accessibilityLabel={t('export.a11y')}>
              {t('export.button')}
            </Button>
          </View>
          {exporter.isPending ? <Text className="text-stone-400 text-xs mt-2">{t('export.preparing')}</Text> : null}
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
              <Button variant="ghost" onPress={() => void Linking.openURL(link)} accessibilityLabel={t('export.openLink')}>
                {t('export.openLink')}
              </Button>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={() => router.push('/(dashboard)/settings/data' as Href)}
          className="bg-white rounded-2xl border border-stone-100 p-5 mt-4 flex-row items-center"
          accessibilityRole="link"
          accessibilityLabel={t('erase.a11y')}
        >
          <View className="flex-1 me-3">
            <Text className="font-bold text-stone-900 text-base">{t('erase.title')}</Text>
            <Text className="text-stone-500 text-sm mt-1 leading-5">{t('erase.body')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.stone[400]} style={RTL_FLIP} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
