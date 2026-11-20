import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { WritingType } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { Input } from '../../../../src/components/ui/Input';
import { useCreateWriting } from '../../../../src/hooks/career/documents';
import { useCareerAccess, useCareerOpportunities, useCareerWritingList } from '../../../../src/hooks/useCareer';
import { useT } from '../../../../src/i18n';
import {
  creditLine,
  EMPTY_WRITING_CONTEXT,
  isTargetedWritingType,
  LETTER_TEMPLATE_OPTIONS,
  opportunityParam,
  paidFailure,
  takesWritingContext,
  WRITING_CONTEXT_LIMITS,
  WRITING_TYPE_OPTIONS,
  writingContextInput,
  type WritingContextDraft,
} from '../../../../src/lib/career/documents';

/**
 * Write a cover letter, bio, LinkedIn text, outreach, referral request or
 * thank-you draft from confirmed facts (website: resume studio "What to
 * write"). Uses one document credit; the request carries an idempotency key
 * that a retry of the same request reuses, so a lost response never charges
 * twice. Optional notes about the recipient are repeated, never added to; a
 * referral request or thank-you note needs a listing or an organization/role.
 * While no writing model is connected the server refuses before reserving a
 * credit, so the screen says "not connected" and offers no paid button.
 * It stays a draft: FlacronCV does not send it.
 */
export default function NewCareerWritingScreen() {
  const router = useRouter();
  const t = useT('careerDocuments');
  const tk = useT('career');
  const access = useCareerAccess();
  const opportunities = useCareerOpportunities();
  const writing = useCareerWritingList();
  const create = useCreateWriting();
  const [type, setType] = useState<WritingType>('cover_letter');
  const [templateId, setTemplateId] = useState('classic');
  // Preselected when opened for a listing (?opportunityId=); the server still checks it is the caller's.
  const { opportunityId: rawListing } = useLocalSearchParams<{ opportunityId?: string }>();
  const [opened] = useState(() => opportunityParam(rawListing));
  const [opportunityId, setOpportunityId] = useState<string | null>(opened);
  const [notes, setNotes] = useState<WritingContextDraft>(EMPTY_WRITING_CONTEXT);
  const [notesError, setNotesError] = useState<string | null>(null);
  const credits = creditLine(writing.data?.documentCredit);
  // Unknown (list not loaded) is not "not connected": only an explicit false from the server hides the paid button.
  const notConnected = writing.data?.textModelConfigured === false;

  const setNote = (key: keyof WritingContextDraft, value: string) => {
    setNotes((prev) => ({ ...prev, [key]: value }));
    setNotesError(null);
  };

  const run = (context: ReturnType<typeof writingContextInput>) => {
    if (!context.ok) return;
    create.mutate(
      { type, opportunityId, templateId: type === 'cover_letter' ? templateId : undefined, context: context.context },
      { onSuccess: (paid) => router.replace(`/(dashboard)/career/documents/letter/${paid.document.id}` as Href) },
    );
  };

  const onWrite = () => {
    if (create.isPending || notConnected) return;
    const context = writingContextInput(type, notes, opportunityId !== null);
    if (!context.ok) {
      setNotesError(context.message);
      return;
    }
    setNotesError(null);
    Alert.alert(
      tk('shared.usesOneCredit'),
      [credits, t('newWriting.confirmBody')].filter(Boolean).join(' '),
      [
        { text: tk('shared.leave'), style: 'cancel' },
        { text: t('newWriting.writeWithCredit'), onPress: () => run(context) },
      ],
    );
  };

  if (access.data && !access.data.enabled) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        <CareerHeader title={tk('shared.writeLetterOrText')} />
        <EmptyState icon="lock-closed-outline" title={tk('shared.notIncluded')} description={tk('shared.v1InTabs')} />
      </SafeAreaView>
    );
  }

  const failure = create.error ? paidFailure(create.error, writing.data?.documentCredit) : null;
  const listings = opportunities.data?.items ?? [];
  // The opened listing is offered even when it is not among the saved ones loaded here.
  const openedMissing = opened !== null && !opportunities.isLoading && !listings.some((item) => item.id === opened);

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={tk('shared.writeLetterOrText')} subtitle={t('newWriting.subtitle')} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4">
          <Text className="text-sm font-semibold text-stone-700 mb-2">{t('newWriting.whatToWrite')}</Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {WRITING_TYPE_OPTIONS.map((option) => (
              <Choice key={option.id} label={option.label} selected={type === option.id} onPress={() => setType(option.id)} />
            ))}
          </View>
        </View>
        {type === 'cover_letter' ? (
          <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4">
            <Text className="text-sm font-semibold text-stone-700 mb-1">{t('newWriting.letterLayout')}</Text>
            <Text className="text-stone-500 text-xs mb-3 leading-4">{t('newWriting.letterLayoutNote')}</Text>
            <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
              {LETTER_TEMPLATE_OPTIONS.map((option) => (
                <Choice key={option.id} label={option.name} accent={option.accent} selected={templateId === option.id} onPress={() => setTemplateId(option.id)} />
              ))}
            </View>
          </View>
        ) : null}
        <View className="bg-surface border border-stone-100 rounded-2xl p-4">
          <Text className="text-sm font-semibold text-stone-700 mb-1">{t('newWriting.forOpportunity')}</Text>
          <Text className="text-stone-500 text-xs mb-3 leading-4">{t('newWriting.pickOpportunity')}</Text>
          <View className="gap-2" accessibilityRole="radiogroup">
            <Choice label={t('newWriting.none')} selected={opportunityId === null} onPress={() => setOpportunityId(null)} />
            {openedMissing ? (
              <Choice label={t('forListing.openedListing')} selected={opportunityId === opened} onPress={() => setOpportunityId(opened)} />
            ) : null}
            {listings.map((item) => (
              <Choice
                key={item.id}
                label={item.organization ? `${item.title} · ${item.organization}` : item.title}
                selected={opportunityId === item.id}
                onPress={() => setOpportunityId(item.id)}
              />
            ))}
          </View>
          {opportunities.isLoading ? <Text className="text-stone-500 text-xs mt-2">{t('newWriting.loadingOpps')}</Text> : null}
          {opportunities.error ? <Text className="text-stone-500 text-xs mt-2">{t('newWriting.oppsFailed')}</Text> : null}
        </View>
        {takesWritingContext(type) ? (
          <View className="bg-surface border border-stone-100 rounded-2xl p-4 mt-4">
            <Text className="text-sm font-semibold text-stone-700 mb-1">{t('newWriting.notesTitle')}</Text>
            <Text className="text-stone-500 text-xs mb-3 leading-4">
              {isTargetedWritingType(type) && opportunityId === null ? t('newWriting.notesNeeded') : t('newWriting.notesHelp')}
            </Text>
            <Input label={t('newWriting.organization')} value={notes.organization} onChangeText={(v) => setNote('organization', v)} maxLength={WRITING_CONTEXT_LIMITS.organization} />
            <Input label={t('newWriting.role')} value={notes.role} onChangeText={(v) => setNote('role', v)} maxLength={WRITING_CONTEXT_LIMITS.role} />
            <Input label={t('newWriting.contactName')} value={notes.contactName} onChangeText={(v) => setNote('contactName', v)} maxLength={WRITING_CONTEXT_LIMITS.contactName} />
            <Input label={t('newWriting.contactRole')} value={notes.contactRole} onChangeText={(v) => setNote('contactRole', v)} maxLength={WRITING_CONTEXT_LIMITS.contactRole} />
            {type === 'thank_you' ? (
              <Input
                label={t('newWriting.interviewDate')}
                value={notes.interviewDate}
                onChangeText={(v) => setNote('interviewDate', v)}
                placeholder="YYYY-MM-DD"
                hint={t('newWriting.dateHint')}
                maxLength={10}
                keyboardType="numbers-and-punctuation"
                autoCorrect={false}
              />
            ) : null}
            {notesError ? (
              <Text className="text-warning text-sm leading-5" accessibilityLiveRegion="polite">
                {notesError}
              </Text>
            ) : null}
          </View>
        ) : null}
        {credits ? <Text className="text-stone-500 text-xs mt-4 leading-4">{credits}</Text> : null}
        {notConnected ? (
          <View className="bg-stone-100 rounded-xl p-3 mt-4" accessibilityLiveRegion="polite">
            <Text className="text-stone-800 text-sm font-semibold">{t('newWriting.notConnectedTitle')}</Text>
            <Text className="text-stone-700 text-sm mt-1 leading-5">{t('newWriting.notConnected')}</Text>
          </View>
        ) : null}
        {failure ? (
          <View className="bg-warning-bg rounded-xl p-3 mt-4" accessibilityLiveRegion="polite">
            <Text className="text-warning text-sm font-semibold">{failure.title}</Text>
            <Text className="text-warning text-sm mt-1">{failure.body}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View className="absolute bottom-0 start-0 end-0 bg-surface border-t border-stone-100 px-5 py-3">
        <Button fullWidth onPress={onWrite} loading={create.isPending} disabled={notConnected}>
          {t('newWriting.writeFromFacts')}
        </Button>
      </View>
    </SafeAreaView>
  );
}

function Choice({ label, selected, accent, onPress }: { label: string; selected: boolean; accent?: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={label}
      className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center ${selected ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-surface'}`}
      activeOpacity={0.8}
    >
      {accent ? <View style={{ backgroundColor: accent }} className="w-3 h-3 rounded-full me-2" /> : null}
      <Text className={`text-sm flex-shrink ${selected ? 'font-semibold text-brand-700' : 'text-stone-700'}`}>{label}</Text>
    </TouchableOpacity>
  );
}
