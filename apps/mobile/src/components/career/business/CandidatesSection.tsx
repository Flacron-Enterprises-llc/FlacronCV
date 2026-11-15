import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { BusinessCandidateDetail, BusinessInvitation, BusinessOverview } from '../../../../../../packages/career-api-client/src/types';
import { useBusinessActions, useOpenCandidate } from '../../../hooks/career/business';
import { useT } from '../../../i18n';
import {
  candidateActions,
  candidateStatusLabel,
  inviteStateLabel,
  looksLikeEmail,
  scopeErrorMessage,
} from '../../../lib/career/business';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { InviteResult } from './InviteResult';
import { NoteView, Section, SwitchRow, Tag, type Note } from './parts';

/** Candidates: list (all, or only assigned ones for counselors), open what they share, invite, revoke, archive/reactivate. */
export function CandidatesSection({ view, workspace }: { view: BusinessOverview; workspace: string | undefined }) {
  const t = useT('careerBusiness.scope');
  const tm = useT('careerBusiness.mobile');
  const actions = useBusinessActions(workspace);
  const open = useOpenCandidate(workspace);
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [invitation, setInvitation] = useState<BusinessInvitation | null>(null);
  const [opened, setOpened] = useState<BusinessCandidateDetail | null>(null);
  const manage = view.scope.manageWorkspace;
  const busy =
    actions.inviteCandidate.isPending || actions.revokeCandidate.isPending || actions.archiveCandidate.isPending || open.isPending;

  const fail = (error: unknown) => setNote({ tone: 'error', text: scopeErrorMessage(error) });

  const invite = () => {
    setNote(null);
    setInvitation(null);
    if (!looksLikeEmail(email)) return setNote({ tone: 'error', text: t('invalidBody') });
    if (!consent) return setNote({ tone: 'error', text: t('consentRequired') });
    actions.inviteCandidate.mutate(
      { email: email.trim(), consent },
      {
        onSuccess: (result) => {
          setInvitation(result);
          setEmail('');
          setConsent(false);
        },
        onError: fail,
      },
    );
  };

  const confirmArchive = (id: string, address: string, archived: boolean) => {
    Alert.alert(
      archived ? t('archiveTitle') : t('reactivateTitle'),
      t(archived ? 'archiveBody' : 'reactivateBody', { email: address }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: archived ? t('archive') : t('reactivate'),
          onPress: () => {
            setNote(null);
            actions.archiveCandidate.mutate({ candidateId: id, archived }, { onError: fail });
          },
        },
      ],
    );
  };

  return (
    <Section title={t('candidatesHeading')}>
      {view.candidates.length === 0 ? (
        <Text className="text-stone-500 text-sm mt-2">{view.scope.candidates === 'assigned' ? t('candidatesNoneAssigned') : t('candidatesEmpty')}</Text>
      ) : (
        view.candidates.map((candidate) => {
          const can = candidateActions(candidate, manage);
          return (
            <View key={candidate.id} className="border border-stone-100 rounded-xl p-3 mt-3">
              <Text className="text-stone-900 text-sm" selectable>
                {candidate.email}
              </Text>
              <View className="flex-row flex-wrap gap-1.5 mt-1.5">
                <Tag label={candidateStatusLabel(candidate.status)} tone={candidate.status === 'active' ? 'success' : 'muted'} />
                {candidate.status === 'invited' ? <Tag label={inviteStateLabel(candidate.inviteState)} tone="muted" /> : null}
                {candidate.shareProfile ? <Tag label={t('sharing')} tone="muted" /> : null}
              </View>
              <View className="flex-row flex-wrap gap-2 mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  accessibilityLabel={`${t('openCandidate')}: ${candidate.email}`}
                  onPress={() => {
                    setNote(null);
                    open.mutate(candidate.id, { onSuccess: setOpened, onError: fail });
                  }}
                >
                  {t('openCandidate')}
                </Button>
                {can.revoke ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    accessibilityLabel={`${t('revokeInvite')}: ${candidate.email}`}
                    onPress={() => {
                      setNote(null);
                      actions.revokeCandidate.mutate(candidate.id, { onError: fail });
                    }}
                  >
                    {t('revokeInvite')}
                  </Button>
                ) : null}
                {can.archive || can.reactivate ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    accessibilityLabel={`${can.archive ? t('archive') : t('reactivate')}: ${candidate.email}`}
                    onPress={() => confirmArchive(candidate.id, candidate.email, can.archive)}
                  >
                    {can.archive ? t('archive') : t('reactivate')}
                  </Button>
                ) : null}
              </View>
            </View>
          );
        })
      )}
      <NoteView note={note} />
      {opened ? (
        <View className="rounded-xl border border-stone-200 bg-stone-50 p-3 mt-3" accessibilityLiveRegion="polite">
          <Text className="font-semibold text-stone-900" selectable>
            {opened.email}
          </Text>
          {opened.shared ? (
            <>
              <Text className="text-stone-700 text-sm mt-1">{t('sharedFacts', { count: opened.shared.confirmedFacts })}</Text>
              {opened.shared.evidence.map((item, index) => (
                <Text key={index} className="text-stone-700 text-sm mt-1">
                  {`• ${item.title}`}
                </Text>
              ))}
            </>
          ) : (
            <Text className="text-stone-500 text-sm mt-1">{t('notShared')}</Text>
          )}
          <View className="mt-2 self-start">
            <Button variant="ghost" size="sm" onPress={() => setOpened(null)}>
              {tm('close')}
            </Button>
          </View>
        </View>
      ) : null}
      {manage ? (
        <View className="mt-5">
          <Text className="font-bold text-stone-900 mb-2" accessibilityRole="header">
            {t('inviteHeading')}
          </Text>
          <Input
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
          />
          <SwitchRow label={t('consent')} value={consent} onChange={setConsent} />
          <Text className="text-stone-500 text-xs leading-4 mt-1">{t('candidateInviteHelp')}</Text>
          <View className="mt-3 self-start">
            <Button onPress={invite} loading={actions.inviteCandidate.isPending} disabled={busy}>
              {t('invite')}
            </Button>
          </View>
          {invitation ? <InviteResult invitation={invitation} /> : null}
        </View>
      ) : null}
    </Section>
  );
}
