import React, { useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import type { BusinessOverview } from '../../../../../../packages/career-api-client/src/types';
import { useBusinessQueue, useBusinessQueueActions } from '../../../hooks/career/business';
import { useT } from '../../../i18n';
import { activeCandidates, queueFor, queueStatusLabel, safeQueueUrl, scopeErrorMessage } from '../../../lib/career/business';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { ChipPicker, NoteView, Section, Tag, type Note } from './parts';

/** The shared opportunity queue: owners, managers and counselors read it and add to it. */
export function QueueSection({ view, workspace }: { view: BusinessOverview; workspace: string | undefined }) {
  const t = useT('careerBusiness.scope');
  const queue = useBusinessQueue(workspace, true);
  const actions = useBusinessQueueActions(workspace);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [note, setNote] = useState<Note | null>(null);
  const busy = actions.add.isPending || actions.remove.isPending;
  const fail = (error: unknown) => setNote({ tone: 'error', text: scopeErrorMessage(error) });
  const items = queue.data?.items ?? [];

  const add = () => {
    setNote(null);
    if (!title.trim()) return setNote({ tone: 'error', text: t('queueTitleRequired') });
    actions.add.mutate(
      { title: title.trim(), url: url.trim() || null, note: text.trim(), candidateId: candidateId || null },
      {
        onSuccess: () => {
          setTitle('');
          setUrl('');
          setText('');
          setCandidateId('');
        },
        onError: fail,
      },
    );
  };

  return (
    <Section title={t('queueHeading')} help={t('queueHelp')}>
      {queue.error ? <NoteView note={{ tone: 'error', text: scopeErrorMessage(queue.error) }} /> : null}
      {queue.isLoading ? (
        <Text className="text-stone-500 text-sm mt-3">{t('loading')}</Text>
      ) : items.length === 0 && !queue.error ? (
        <Text className="text-stone-500 text-sm mt-3">{t('queueEmpty')}</Text>
      ) : (
        items.map((item) => {
          const link = safeQueueUrl(item.url);
          const forWhom = queueFor(item, view.candidates);
          return (
            <View key={item.id} className="border border-stone-100 rounded-xl p-3 mt-3">
              <View className="flex-row items-start justify-between gap-2">
                {link ? (
                  <TouchableOpacity
                    className="flex-1 min-h-[44px] justify-center"
                    onPress={() => void Linking.openURL(link)}
                    accessibilityRole="link"
                    accessibilityLabel={item.title}
                  >
                    <Text className="font-semibold text-brand-700 underline">{item.title}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text className="font-semibold text-stone-900 flex-1">{item.title}</Text>
                )}
                <Tag label={queueStatusLabel(item.status)} tone="muted" />
              </View>
              {item.note ? <Text className="text-stone-500 text-sm mt-1">{item.note}</Text> : null}
              {forWhom ? <Text className="text-stone-500 text-sm mt-1">{forWhom}</Text> : null}
              <View className="mt-2 self-start">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  accessibilityLabel={`${t('delete')}: ${item.title}`}
                  onPress={() => {
                    setNote(null);
                    actions.remove.mutate(item.id, { onError: fail });
                  }}
                >
                  {t('delete')}
                </Button>
              </View>
            </View>
          );
        })
      )}
      <View className="mt-5">
        <Input label={t('queueTitle')} value={title} onChangeText={setTitle} maxLength={200} />
        <Input label={t('queueUrl')} value={url} onChangeText={setUrl} maxLength={500} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
        <Input label={t('queueNote')} value={text} onChangeText={setText} maxLength={2000} multiline />
        <ChipPicker
          label={t('queueRecommendTo')}
          value={candidateId}
          options={[{ value: '', label: t('queueEveryone') }, ...activeCandidates(view).map((candidate) => ({ value: candidate.id, label: candidate.email }))]}
          onChange={setCandidateId}
        />
        <View className="self-start">
          <Button onPress={add} loading={actions.add.isPending} disabled={busy}>
            {t('queueAdd')}
          </Button>
        </View>
      </View>
      <NoteView note={note} />
    </Section>
  );
}
