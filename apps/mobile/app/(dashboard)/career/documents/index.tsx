import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCareerAccess, useCareerResumes, useCareerWritingList } from '../../../../src/hooks/useCareer';
import { careerErrorMessage, formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

const WRITING_LABEL: Record<string, string> = {
  cover_letter: 'Cover letter',
  bio: 'Bio',
  linkedin: 'LinkedIn text',
  outreach: 'Outreach message',
};

/**
 * Career drafts (career CVs and letters). These are career-service documents,
 * separate from the FlacronCV CVs and cover letters in the other tabs; moving
 * one into the FlacronCV editor is done on the website.
 */
export default function CareerDocumentsScreen() {
  const router = useRouter();
  const access = useCareerAccess();
  const resumes = useCareerResumes();
  const writing = useCareerWritingList();
  const loading = access.isLoading || resumes.isLoading || writing.isLoading;
  const error = access.error ?? resumes.error ?? writing.error;
  const refetch = () => {
    void resumes.refetch();
    void writing.refetch();
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" description="Your FlacronCV CVs and cover letters are in their own tabs." />;
  } else if (loading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (error) {
    content = <ErrorState message={careerErrorMessage(error, 'Could not load your career drafts.')} onRetry={refetch} />;
  } else {
    const resumeItems = resumes.data?.items ?? [];
    const writingItems = writing.data?.items ?? [];
    content =
      resumeItems.length + writingItems.length === 0 ? (
        <EmptyState icon="document-text-outline" title="No career drafts yet" description="Career drafts are created from your confirmed facts on the FlacronCV website." />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={resumes.isRefetching || writing.isRefetching} onRefresh={refetch} tintColor={colors.brand[600]} />}
        >
          <Text className="text-stone-500 text-sm mb-4 leading-5">
            Career drafts are separate from your FlacronCV CVs and cover letters. Editing and exporting uses no credits.
          </Text>
          {resumeItems.length > 0 ? <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">CVs</Text> : null}
          {resumeItems.map((r) => (
            <Row
              key={r.id}
              title={r.title}
              meta={`${r.language.toUpperCase()} · created ${formatDay(r.createdAt) ?? ''}`}
              disabled={!r.currentVersionId}
              onPress={() => router.push(`/(dashboard)/career/documents/resume/${r.id}` as Href)}
            />
          ))}
          {writingItems.length > 0 ? <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-4 mb-3">Letters and texts</Text> : null}
          {writingItems.map((w) => (
            <Row
              key={w.id}
              title={w.title}
              meta={`${WRITING_LABEL[w.type] ?? w.type} · updated ${formatDay(w.updatedAt) ?? ''}`}
              pill={w.confirmation === 'confirmed' ? 'CONFIRMED' : 'DRAFT'}
              onPress={() => router.push(`/(dashboard)/career/documents/letter/${w.id}` as Href)}
            />
          ))}
        </ScrollView>
      );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Career drafts" />
      {content}
    </SafeAreaView>
  );
}

function Row({ title, meta, pill, disabled, onPress }: { title: string; meta: string; pill?: string; disabled?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className="bg-white border border-stone-100 rounded-2xl p-4 mb-3 flex-row items-center min-h-[56px]"
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      activeOpacity={0.8}
    >
      <View className="flex-1 mr-2">
        <Text className="font-bold text-stone-900" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-stone-500 text-sm mt-0.5">{disabled ? 'No saved version yet' : meta}</Text>
        {pill ? (
          <View className="mt-2">
            <Pill label={pill} tone={pill === 'CONFIRMED' ? 'success' : 'default'} />
          </View>
        ) : null}
      </View>
      {!disabled ? <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} /> : null}
    </TouchableOpacity>
  );
}
