import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NoteView, Section, type Note } from '../../../../src/components/career/business/parts';
import { CareerHeader } from '../../../../src/components/career/CareerHeader';
import { FeatureState } from '../../../../src/components/career/FeatureState';
import { Button } from '../../../../src/components/ui/Button';
import { Input } from '../../../../src/components/ui/Input';
import { useAcceptInvitation } from '../../../../src/hooks/career/business';
import { useT } from '../../../../src/i18n';
import { joinDoneMessage, joinErrorMessage, tokenFromInput } from '../../../../src/lib/career/business';

/**
 * Where a Business invitation lands (website: /career/business/join). Opened
 * from the invitation link (`?token=…`, also as a deep link) or by pasting the
 * link or code. The person accepts explicitly; the API checks that their
 * verified address is the invited one.
 */
export default function BusinessJoinScreen() {
  const t = useT('careerBusiness');
  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('scope.joinTitle')} subtitle={t('scope.joinMetaDescription')} />
      <FeatureState href="/career/business" ignorePlan>
        <JoinBody />
      </FeatureState>
    </SafeAreaView>
  );
}

function JoinBody() {
  const t = useT('careerBusiness');
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const initial = Array.isArray(params.token) ? params.token[0] : params.token;
  const [input, setInput] = useState(initial ?? '');
  const [note, setNote] = useState<Note | null>(null);
  const [done, setDone] = useState<'staff' | 'candidate' | null>(null);
  const accept = useAcceptInvitation();
  const token = tokenFromInput(input);

  const onAccept = () => {
    setNote(null);
    if (!token) return setNote({ tone: 'error', text: t('scope.joinNoToken') });
    accept.mutate(token, {
      onSuccess: (result) => setDone(result.kind),
      onError: (error) => setNote({ tone: 'error', text: joinErrorMessage(error) }),
    });
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Section title={t('scope.joinHeading')} help={t('scope.joinHelp')}>
        {done ? (
          <>
            <NoteView note={{ tone: 'success', text: joinDoneMessage(done) }} />
            <View className="mt-3 self-start">
              <Button onPress={() => router.replace('/(dashboard)/career/business' as Href)}>{t('mobile.openBusiness')}</Button>
            </View>
          </>
        ) : (
          <View className="mt-3">
            <Input
              label={t('mobile.joinCodeLabel')}
              hint={t('mobile.joinCodeHint')}
              value={input}
              onChangeText={setInput}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              style={{ writingDirection: 'ltr' }}
            />
            {initial && !tokenFromInput(initial) ? <Text className="text-red-700 text-sm">{t('scope.joinNoToken')}</Text> : null}
            <View className="self-start mt-1">
              <Button onPress={onAccept} loading={accept.isPending} disabled={accept.isPending || !token}>
                {t('scope.joinAccept')}
              </Button>
            </View>
            <NoteView note={note} />
          </View>
        )}
      </Section>
    </ScrollView>
  );
}
