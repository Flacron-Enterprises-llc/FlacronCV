import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { useCareerExport } from '../../../src/hooks/career/data';
import { useUid } from '../../../src/hooks/useCareer';
import { careerApi, freshIdToken } from '../../../src/lib/career-api';
import {
  eraseCareerData,
  eraseConfirmed,
  eraseResultMessage,
  exportErrorMessage,
  exportFailedMessage,
} from '../../../src/lib/career/data';
import { careerDrafts } from '../../../src/store/career-drafts';
import { colors } from '../../../src/theme/colors';
import { useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';

type Note = { tone: 'success' | 'error'; text: string };

/**
 * Career data (website: /career/data). Export prepares a JSON file of every
 * career record and file held for you and opens the share sheet. Erase removes
 * the career data only and keeps the FlacronCV account, CVs, cover letters,
 * Job Tracker and subscription: same request, typed word (DELETE) and
 * fresh-token rule as the website (src/lib/career/data.ts). Both work whatever
 * the plan, so leaving a plan never traps data. Closing the whole account
 * stays in Settings › Your data.
 */
export default function CareerDataScreen() {
  const t = useT('careerModes.data');
  const th = useT('careerHub.erase');
  const tc = useT('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const uid = useUid();
  const exporter = useCareerExport();
  const [note, setNote] = useState<Note | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [erasing, setErasing] = useState(false);
  const [eraseNote, setEraseNote] = useState<Note | null>(null);
  // Synchronous guard: a second tap before React re-renders must not send a second erase.
  const eraseInFlight = useRef(false);

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

  const runErase = async () => {
    if (eraseInFlight.current) return;
    eraseInFlight.current = true;
    setErasing(true);
    setEraseNote(null);
    try {
      const result = await eraseCareerData({
        deleteAccount: (input) => careerApi.deleteAccount(input),
        freshIdToken,
      });
      const gone = result === 'erased' || result === 'none';
      setEraseNote({ tone: gone ? 'success' : 'error', text: eraseResultMessage(result) });
      if (gone) {
        setConfirm('');
        if (uid) {
          // Nothing cached from before the erase may show again: reset every
          // career query of this account (screens still open refetch) and drop
          // its unsaved draft edits. V1 data (CVs, letters, jobs) is untouched.
          careerDrafts.clearUser(uid);
          await queryClient.resetQueries({ queryKey: ['career', uid] });
        }
      }
    } finally {
      eraseInFlight.current = false;
      setErasing(false);
    }
  };

  const onErase = () => {
    if (erasing) return;
    if (!eraseConfirmed(confirm)) {
      setEraseNote({ tone: 'error', text: th('confirmExact') });
      return;
    }
    Alert.alert(th('dialogTitle'), [th('body'), th('dialogBody')].join('\n\n'), [
      { text: tc('cancel'), style: 'cancel' },
      { text: th('button'), style: 'destructive', onPress: () => void runErase() },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('title')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
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
            {note ? <NoteBox note={note} /> : null}
            {link ? (
              <View className="mt-3 self-start">
                <Button variant="ghost" onPress={() => void Linking.openURL(link)} accessibilityLabel={t('export.openLink')}>
                  {t('export.openLink')}
                </Button>
              </View>
            ) : null}
          </View>

          <View className="bg-white rounded-2xl border border-red-100 p-5 mt-4">
            <Text className="font-bold text-stone-900 text-base">{th('title')}</Text>
            <Text className="text-stone-500 text-sm mt-1 mb-4 leading-5">{th('body')}</Text>
            <Input
              label={th('confirmLabel')}
              value={confirm}
              onChangeText={setConfirm}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              editable={!erasing}
              accessibilityLabel={th('confirmLabel')}
            />
            <View className="self-start">
              <Button variant="danger" onPress={onErase} loading={erasing} disabled={erasing}>
                {th('button')}
              </Button>
            </View>
            {eraseNote ? <NoteBox note={eraseNote} /> : null}
          </View>

          <TouchableOpacity
            onPress={() => router.push('/(dashboard)/settings/data' as Href)}
            className="bg-white rounded-2xl border border-stone-100 p-5 mt-4 flex-row items-center"
            accessibilityRole="link"
          >
            <View className="flex-1 me-3">
              <Text className="font-bold text-stone-900 text-base">{th('closeAccountTitle')}</Text>
              <Text className="text-stone-500 text-sm mt-1 leading-5">{th('closeAccountBody')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.stone[400]} style={RTL_FLIP} />
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function NoteBox({ note }: { note: Note }) {
  return (
    <View
      className={`rounded-xl border p-3 mt-4 ${note.tone === 'success' ? 'bg-success-bg border-green-200' : 'bg-red-50 border-red-200'}`}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text className={`text-sm ${note.tone === 'success' ? 'text-success' : 'text-red-700'}`}>{note.text}</Text>
    </View>
  );
}
