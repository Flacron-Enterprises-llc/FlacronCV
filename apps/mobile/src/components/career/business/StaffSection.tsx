import React, { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import type { BusinessInvitation, BusinessOverview, BusinessStaffRole } from '../../../../../../packages/career-api-client/src/types';
import { useBusinessActions } from '../../../hooks/career/business';
import { useT } from '../../../i18n';
import {
  assignableCandidates,
  assignableCounselors,
  looksLikeEmail,
  roleLabel,
  roleScope,
  scopeErrorMessage,
  STAFF_ROLES,
  staffName,
  staffStatusLabel,
} from '../../../lib/career/business';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { InviteResult } from './InviteResult';
import { ChipPicker, NoteView, Section, Tag, type Note } from './parts';

/** Staff (account holder and managers only): list, remove, invite with a role, assign counselors. */
export function StaffSection({ view, workspace }: { view: BusinessOverview; workspace: string | undefined }) {
  const t = useT('careerBusiness.scope');
  const tm = useT('careerBusiness.mobile');
  const actions = useBusinessActions(workspace);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BusinessStaffRole>('counselor');
  const [note, setNote] = useState<Note | null>(null);
  const [invitation, setInvitation] = useState<BusinessInvitation | null>(null);
  const [assignStaff, setAssignStaff] = useState('');
  const [assignCandidate, setAssignCandidate] = useState('');
  const counselors = assignableCounselors(view);
  const candidates = assignableCandidates(view);
  const busy = actions.inviteStaff.isPending || actions.removeStaff.isPending || actions.assign.isPending;
  const fail = (error: unknown) => setNote({ tone: 'error', text: scopeErrorMessage(error) });

  const invite = () => {
    setNote(null);
    setInvitation(null);
    if (!looksLikeEmail(email)) return setNote({ tone: 'error', text: t('invalidBody') });
    actions.inviteStaff.mutate(
      { email: email.trim(), role },
      {
        onSuccess: (result) => {
          setInvitation(result);
          setEmail('');
        },
        onError: fail,
      },
    );
  };

  const confirmRemove = (id: string, name: string) => {
    Alert.alert(t('removeStaffTitle'), t('removeStaffBody', { name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('removeStaff'),
        style: 'destructive',
        onPress: () => {
          setNote(null);
          actions.removeStaff.mutate(id, { onSuccess: () => setNote({ tone: 'success', text: t('staffRemoved') }), onError: fail });
        },
      },
    ]);
  };

  const assign = () => {
    setNote(null);
    if (!assignStaff || !assignCandidate) return setNote({ tone: 'error', text: t('assignRequired') });
    actions.assign.mutate(
      { staffId: assignStaff, candidateId: assignCandidate },
      {
        onSuccess: () => {
          setNote({ tone: 'success', text: t('assigned') });
          setAssignStaff('');
          setAssignCandidate('');
        },
        onError: fail,
      },
    );
  };

  return (
    <Section title={t('staffHeading')}>
      {view.staff.length === 0 ? (
        <Text className="text-stone-500 text-sm mt-2">{t('staffEmpty')}</Text>
      ) : (
        view.staff.map((member) => {
          const name = staffName(member);
          const label = member.status === 'active' ? t('removeStaff') : t('revokeInvite');
          return (
            <View key={member.id} className="border border-stone-100 rounded-xl p-3 mt-3">
              <Text className="text-stone-900 text-sm" selectable>
                {name}
              </Text>
              <View className="flex-row flex-wrap items-center gap-1.5 mt-1.5">
                <Tag label={roleLabel(member.role)} tone="muted" />
                <Tag label={staffStatusLabel(member.status)} tone={member.status === 'active' ? 'success' : 'muted'} />
              </View>
              <View className="mt-2 self-start">
                <Button variant="outline" size="sm" disabled={busy} accessibilityLabel={`${label}: ${name}`} onPress={() => confirmRemove(member.id, name)}>
                  {label}
                </Button>
              </View>
            </View>
          );
        })
      )}

      <View className="mt-5">
        <Text className="font-bold text-stone-900 mb-2" accessibilityRole="header">
          {t('addStaff')}
        </Text>
        <Input
          label={tm('staffEmail')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
        />
        <ChipPicker
          label={t('staffRole')}
          value={role}
          options={STAFF_ROLES.map((value) => ({ value, label: roleLabel(value) }))}
          onChange={(value) => value && setRole(value)}
        />
        <Text className="text-stone-500 text-xs leading-4">{roleScope(role)}</Text>
        <View className="mt-3 self-start">
          <Button onPress={invite} loading={actions.inviteStaff.isPending} disabled={busy}>
            {t('invite')}
          </Button>
        </View>
        {invitation ? <InviteResult invitation={invitation} /> : null}
      </View>

      <View className="mt-5">
        <Text className="font-bold text-stone-900 mb-2" accessibilityRole="header">
          {t('assignHeading')}
        </Text>
        <ChipPicker
          label={t('assignStaff')}
          value={assignStaff}
          options={counselors.map((member) => ({ value: member.id, label: staffName(member) }))}
          onChange={setAssignStaff}
        />
        <ChipPicker
          label={t('assignCandidate')}
          value={assignCandidate}
          options={candidates.map((candidate) => ({ value: candidate.id, label: candidate.email }))}
          onChange={setAssignCandidate}
        />
        <View className="self-start">
          <Button variant="outline" onPress={assign} loading={actions.assign.isPending} disabled={busy || counselors.length === 0 || candidates.length === 0}>
            {t('assign')}
          </Button>
        </View>
      </View>
      <NoteView note={note} />
    </Section>
  );
}
