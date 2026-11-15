import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { BusinessMemberships } from '../../../../../../packages/career-api-client/src/types';
import { useMembershipActions } from '../../../hooks/career/business';
import { useT } from '../../../i18n';
import { candidateStatusLabel, scopeErrorMessage } from '../../../lib/career/business';
import { Button } from '../../ui/Button';
import { NoteView, Section, SwitchRow, Tag, type Note } from './parts';

/** The invited candidate's own view: what they share with staff, and leaving. */
export function MyMemberships({ items }: { items: BusinessMemberships['candidateOf'] }) {
  const t = useT('careerBusiness.scope');
  const actions = useMembershipActions();
  const [note, setNote] = useState<Note | null>(null);
  const busy = actions.share.isPending || actions.leave.isPending;
  const fail = (error: unknown) => setNote({ tone: 'error', text: scopeErrorMessage(error) });

  const confirmLeave = (candidateId: string) => {
    Alert.alert(t('leaveTitle'), t('leaveBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('leaveWorkspace'),
        style: 'destructive',
        onPress: () => {
          setNote(null);
          actions.leave.mutate(candidateId, { onError: fail });
        },
      },
    ]);
  };

  return (
    <Section title={t('myWorkspacesHeading')} help={t('myWorkspacesHelp')}>
      {items.map((item, index) => (
        <View key={item.candidateId} className="border border-stone-100 rounded-xl p-3 mt-3">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <Text className="text-stone-900 font-semibold">{t('myWorkspaceN', { n: index + 1 })}</Text>
            <Tag label={candidateStatusLabel(item.status)} tone={item.status === 'active' ? 'success' : 'muted'} />
          </View>
          <SwitchRow
            label={t('shareWithStaff')}
            value={item.shareProfile}
            disabled={busy || item.status !== 'active'}
            onChange={(shareProfile) => {
              setNote(null);
              actions.share.mutate({ candidateId: item.candidateId, shareProfile }, { onError: fail });
            }}
          />
          <View className="mt-1 self-start">
            <Button variant="outline" size="sm" disabled={busy} onPress={() => confirmLeave(item.candidateId)}>
              {t('leaveWorkspace')}
            </Button>
          </View>
        </View>
      ))}
      <NoteView note={note} />
    </Section>
  );
}
