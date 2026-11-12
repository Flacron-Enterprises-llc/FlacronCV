import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { WritingType } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { useCreateWriting } from '../../../../src/hooks/career/documents';
import { useCareerAccess, useCareerOpportunities, useCareerWritingList } from '../../../../src/hooks/useCareer';
import { creditLine, LETTER_TEMPLATE_OPTIONS, paidFailure, WRITING_TYPE_OPTIONS } from '../../../../src/lib/career/documents';

/**
 * Write a cover letter, bio, LinkedIn text or outreach draft from confirmed
 * facts (website: resume studio "What to write"). Uses one document credit;
 * the request carries an idempotency key that a retry of the same request
 * reuses, so a lost response never charges twice. It stays a draft:
 * FlacronCV does not send it.
 */
export default function NewCareerWritingScreen() {
  const router = useRouter();
  const access = useCareerAccess();
  const opportunities = useCareerOpportunities();
  const writing = useCareerWritingList();
  const create = useCreateWriting();
  const [type, setType] = useState<WritingType>('cover_letter');
  const [templateId, setTemplateId] = useState('classic');
  const [opportunityId, setOpportunityId] = useState<string | null>(null);
  const credits = creditLine(writing.data?.documentCredit);

  const run = () => {
    create.mutate(
      { type, opportunityId, templateId: type === 'cover_letter' ? templateId : undefined },
      { onSuccess: (paid) => router.replace(`/(dashboard)/career/documents/letter/${paid.document.id}` as Href) },
    );
  };

  const onWrite = () => {
    if (create.isPending) return;
    Alert.alert(
      'This uses 1 document credit',
      `${credits ? `${credits} ` : ''}The draft uses your confirmed facts only. It does not add employers, dates or numbers.`,
      [
        { text: 'Leave', style: 'cancel' },
        { text: 'Write with 1 credit', onPress: run },
      ],
    );
  };

  if (access.data && !access.data.enabled) {
    return (
      <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
        <CareerHeader title="Write a letter or text" />
        <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" description="Your FlacronCV CVs and cover letters are in their own tabs." />
      </SafeAreaView>
    );
  }

  const failure = create.error ? paidFailure(create.error, writing.data?.documentCredit) : null;
  const listings = opportunities.data?.items ?? [];

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Write a letter or text" subtitle="From your confirmed facts. This stays a draft; FlacronCV does not send it." />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
          <Text className="text-sm font-semibold text-stone-700 mb-2">What to write</Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {WRITING_TYPE_OPTIONS.map((option) => (
              <Choice key={option.id} label={option.label} selected={type === option.id} onPress={() => setType(option.id)} />
            ))}
          </View>
        </View>
        {type === 'cover_letter' ? (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
            <Text className="text-sm font-semibold text-stone-700 mb-1">Cover-letter layout</Text>
            <Text className="text-stone-500 text-xs mb-3 leading-4">The layout is saved with the draft. Changing it later keeps the text.</Text>
            <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
              {LETTER_TEMPLATE_OPTIONS.map((option) => (
                <Choice key={option.id} label={option.name} accent={option.accent} selected={templateId === option.id} onPress={() => setTemplateId(option.id)} />
              ))}
            </View>
          </View>
        ) : null}
        <View className="bg-white border border-stone-100 rounded-2xl p-4">
          <Text className="text-sm font-semibold text-stone-700 mb-1">For a saved opportunity (optional)</Text>
          <Text className="text-stone-500 text-xs mb-3 leading-4">Pick one of your saved opportunities, or none for a general draft.</Text>
          <View className="gap-2" accessibilityRole="radiogroup">
            <Choice label="None (general draft)" selected={opportunityId === null} onPress={() => setOpportunityId(null)} />
            {listings.map((item) => (
              <Choice
                key={item.id}
                label={item.organization ? `${item.title} · ${item.organization}` : item.title}
                selected={opportunityId === item.id}
                onPress={() => setOpportunityId(item.id)}
              />
            ))}
          </View>
          {opportunities.isLoading ? <Text className="text-stone-500 text-xs mt-2">Loading your opportunities…</Text> : null}
          {opportunities.error ? <Text className="text-stone-500 text-xs mt-2">Your opportunities could not be loaded; you can still write a general draft.</Text> : null}
        </View>
        {credits ? <Text className="text-stone-500 text-xs mt-4 leading-4">{credits}</Text> : null}
        {failure ? (
          <View className="bg-warning-bg rounded-xl p-3 mt-4" accessibilityLiveRegion="polite">
            <Text className="text-warning text-sm font-semibold">{failure.title}</Text>
            <Text className="text-warning text-sm mt-1">{failure.body}</Text>
          </View>
        ) : null}
      </ScrollView>
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-stone-100 px-5 py-3">
        <Button fullWidth onPress={onWrite} loading={create.isPending}>
          Write from confirmed facts
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
      className={`min-h-[44px] px-3 py-2 rounded-xl border flex-row items-center ${selected ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'}`}
      activeOpacity={0.8}
    >
      {accent ? <View style={{ backgroundColor: accent }} className="w-3 h-3 rounded-full mr-2" /> : null}
      <Text className={`text-sm flex-shrink ${selected ? 'font-semibold text-brand-700' : 'text-stone-700'}`}>{label}</Text>
    </TouchableOpacity>
  );
}
