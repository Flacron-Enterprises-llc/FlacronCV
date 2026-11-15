import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCareerAccess, useCareerOpportunities, useCareerResumes, useCareerWritingList } from '../../../../src/hooks/useCareer';
import { creditLine, letterTemplateName, opportunityParam, resumeTemplateName, writingTypeLabel } from '../../../../src/lib/career/documents';
import { careerErrorMessage, formatDay } from '../../../../src/lib/career-view';
import { useT } from '../../../../src/i18n';
import { RTL_FLIP } from '../../../../src/i18n/native';
import { colors } from '../../../../src/theme/colors';

/**
 * Career drafts (career CVs and letters). These are career-service documents,
 * separate from the FlacronCV CVs and cover letters in the other tabs; moving
 * one into the FlacronCV editor is done on the website. A new CV (free) and a
 * new letter or text (one document credit) start from the buttons at the top.
 */
export default function CareerDocumentsScreen() {
  const router = useRouter();
  const t = useT('careerDocuments');
  const tk = useT('career');
  const writingLabel = (type: string) => (type === 'outreach' ? t('list.outreachMessage') : writingTypeLabel(type));
  const access = useCareerAccess();
  const resumes = useCareerResumes();
  const writing = useCareerWritingList();
  const loading = access.isLoading || resumes.isLoading || writing.isLoading;
  const error = access.error ?? resumes.error ?? writing.error;
  const refetch = () => {
    void resumes.refetch();
    void writing.refetch();
  };
  // Opened for a listing (?opportunityId=, e.g. a listing's "Prepare a CV"): every route below carries it.
  const { opportunityId: rawListing } = useLocalSearchParams<{ opportunityId?: string }>();
  const forListing = opportunityParam(rawListing);
  const opportunities = useCareerOpportunities();
  const listingTitle = forListing
    ? (opportunities.data?.items.find((item) => item.id === forListing)?.title ?? t('forListing.openedListing'))
    : null;
  const query = forListing ? `?opportunityId=${encodeURIComponent(forListing)}` : '';
  const newResume = () => router.push(`/(dashboard)/career/documents/new-resume${query}` as Href);
  const newWriting = () => router.push(`/(dashboard)/career/documents/new-writing${query}` as Href);
  const listingBanner =
    forListing && listingTitle ? (
      <View className="bg-brand-50 border border-brand-100 rounded-2xl p-4 mb-4" accessibilityLiveRegion="polite">
        <Text className="font-semibold text-stone-900" accessibilityRole="header">
          {t('forListing.title', { title: listingTitle })}
        </Text>
        <Text className="text-stone-600 text-sm mt-1 leading-5">{t('forListing.body')}</Text>
        <View className="flex-row flex-wrap gap-2 mt-3">
          <Button size="sm" variant="outline" onPress={newWriting}>
            {t('forListing.write')}
          </Button>
          <Button size="sm" variant="ghost" onPress={() => router.setParams({ opportunityId: undefined })} accessibilityLabel={t('forListing.clearA11y')}>
            {t('forListing.clear')}
          </Button>
        </View>
      </View>
    ) : null;

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={tk('shared.notIncluded')} description={tk('shared.v1InTabs')} />;
  } else if (loading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (error) {
    content = <ErrorState message={careerErrorMessage(error, t('list.loadFailed'))} onRetry={refetch} />;
  } else {
    const resumeItems = resumes.data?.items ?? [];
    const writingItems = writing.data?.items ?? [];
    const credits = creditLine(resumes.data?.documentCredit ?? writing.data?.documentCredit);
    content =
      resumeItems.length + writingItems.length === 0 ? (
        <View className="flex-1">
          {listingBanner ? <View className="px-5 pt-5">{listingBanner}</View> : null}
          <EmptyState
            icon="document-text-outline"
            title={t('list.emptyTitle')}
            description={t('list.emptyBody')}
            actionLabel={t('list.createCv')}
            onAction={newResume}
          />
          <View className="px-5 pb-6">
            <Button variant="ghost" fullWidth onPress={newWriting}>
              {t('list.writeInstead')}
            </Button>
          </View>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={resumes.isRefetching || writing.isRefetching} onRefresh={refetch} tintColor={colors.brand[600]} />}
        >
          {listingBanner}
          <Text className="text-stone-500 text-sm mb-4 leading-5">
            {[t('list.intro'), credits].filter(Boolean).join(' ')}
          </Text>
          <View className="flex-row gap-3 mb-5">
            <View className="flex-1">
              <Button variant="outline" fullWidth onPress={newResume} accessibilityLabel={t('list.newCvA11y')}>
                {t('list.newCv')}
              </Button>
            </View>
            <View className="flex-1">
              <Button variant="outline" fullWidth onPress={newWriting} accessibilityLabel={tk('shared.writeLetterOrText')}>
                {t('list.writeLetter')}
              </Button>
            </View>
          </View>
          {resumeItems.length > 0 ? <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">{t('list.cvs')}</Text> : null}
          {resumeItems.map((r) => (
            <Row
              key={r.id}
              title={r.title}
              meta={`${r.language.toUpperCase()} · ${resumeTemplateName(r.templateId)} · ${t('list.created', { date: formatDay(r.createdAt) ?? '' })}`}
              disabled={!r.currentVersionId}
              onPress={() => router.push(`/(dashboard)/career/documents/resume/${r.id}${query}` as Href)}
            />
          ))}
          {writingItems.length > 0 ? <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mt-4 mb-3">{t('list.lettersAndTexts')}</Text> : null}
          {writingItems.map((w) => (
            <Row
              key={w.id}
              title={w.title}
              meta={`${writingLabel(w.type)}${w.type === 'cover_letter' ? ` · ${letterTemplateName(w.templateId)}` : ''} · ${t('list.updated', { date: formatDay(w.updatedAt) ?? '' })}`}
              pill={w.confirmation === 'confirmed' ? tk('shared.confirmedPill') : tk('shared.draftPill')}
              pillConfirmed={w.confirmation === 'confirmed'}
              onPress={() => router.push(`/(dashboard)/career/documents/letter/${w.id}` as Href)}
            />
          ))}
        </ScrollView>
      );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={tk('areas.documents.title')} />
      {content}
    </SafeAreaView>
  );
}

function Row({
  title,
  meta,
  pill,
  pillConfirmed,
  disabled,
  onPress,
}: {
  title: string;
  meta: string;
  pill?: string;
  pillConfirmed?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const t = useT('careerDocuments');
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className="bg-white border border-stone-100 rounded-2xl p-4 mb-3 flex-row items-center min-h-[56px]"
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      activeOpacity={0.8}
    >
      <View className="flex-1 me-2">
        <Text className="font-bold text-stone-900" numberOfLines={1}>
          {title}
        </Text>
        <Text className="text-stone-500 text-sm mt-0.5">{disabled ? t('list.noVersion') : meta}</Text>
        {pill ? (
          <View className="mt-2">
            <Pill label={pill} tone={pillConfirmed ? 'success' : 'default'} />
          </View>
        ) : null}
      </View>
      {!disabled ? <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} style={RTL_FLIP} /> : null}
    </TouchableOpacity>
  );
}
