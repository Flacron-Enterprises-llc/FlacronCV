import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React from 'react';
import { FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useEvidenceGate, useEvidenceList } from '../../../../src/hooks/career/evidence';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { evidenceLabelView, evidenceTypeLabel, formatBytes } from '../../../../src/lib/career/evidence';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

/**
 * Evidence vault: projects, credentials, work samples, references and
 * publications that back career claims. Same items and labels as the website.
 */
export default function EvidenceListScreen() {
  const router = useRouter();
  const access = useCareerAccess();
  const gate = useEvidenceGate();
  const list = useEvidenceList();

  const addButton =
    gate === 'open' ? (
      <TouchableOpacity
        onPress={() => router.push('/(dashboard)/career/evidence/new' as Href)}
        className="h-11 w-11 items-center justify-center rounded-full bg-brand-600"
        accessibilityRole="button"
        accessibilityLabel="Add evidence item"
      >
        <Ionicons name="add" size={24} color={colors.white} />
      </TouchableOpacity>
    ) : null;

  let content: React.ReactNode;
  if (gate === 'locked') {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (gate === 'off') {
    content = <EmptyState icon="lock-closed-outline" title="The Evidence vault is switched off" description="Your career profile and drafts are unchanged." />;
  } else if (gate === 'loading' || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (gate === 'error' || list.error) {
    content = (
      <ErrorState
        message={careerErrorMessage(list.error ?? access.error, 'Could not load your evidence. Try again.')}
        onRetry={() => void (list.error ? list.refetch() : access.refetch())}
      />
    );
  } else {
    content = (
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
        ListHeaderComponent={
          <Text className="text-stone-500 text-sm mb-4 leading-5">
            Projects, credentials and work samples that back your career claims. Labels show only what has been established: a photo of a certificate is evidence attached, not issuer verified.
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            icon="ribbon-outline"
            title="No evidence items yet"
            description="Add projects, certifications, or work samples to support your profile facts."
            actionLabel="Add evidence item"
            onAction={() => router.push('/(dashboard)/career/evidence/new' as Href)}
          />
        }
        renderItem={({ item }) => {
          const label = evidenceLabelView(item.evidenceLabel);
          return (
            <TouchableOpacity
              onPress={() => router.push(`/(dashboard)/career/evidence/${encodeURIComponent(item.id)}` as Href)}
              className="bg-white border border-stone-100 rounded-2xl p-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${evidenceTypeLabel(item.evidenceType)}, ${label.text.toLowerCase()}`}
              accessibilityHint="Opens the item to edit it or manage its file"
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{evidenceTypeLabel(item.evidenceType)}</Text>
                <Pill label={label.text} tone={label.tone} />
              </View>
              <Text className="font-bold text-stone-900">{item.title}</Text>
              {item.description ? (
                <Text className="text-stone-500 text-sm mt-0.5" numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              {item.linkedSkills.length > 0 ? (
                <Text className="text-stone-500 text-xs mt-2" numberOfLines={1}>
                  {item.linkedSkills.join(' · ')}
                </Text>
              ) : null}
              <View className="flex-row items-center justify-between mt-3">
                <View className="flex-row items-center flex-1 mr-2">
                  {item.attachmentStored || item.attachmentUrl ? (
                    <>
                      <Ionicons name={item.attachmentStored ? 'document-attach-outline' : 'link-outline'} size={14} color={colors.stone[500]} />
                      <Text className="text-stone-500 text-xs ml-1" numberOfLines={1}>
                        {item.attachmentStored
                          ? `${item.attachmentName ?? 'Private file'} ${formatBytes(item.attachmentSizeBytes)}`.trim()
                          : (item.attachmentName ?? 'Link')}
                      </Text>
                    </>
                  ) : null}
                </View>
                <Text className="text-stone-400 text-xs">{item.isPortfolioShared ? 'Shared in portfolio' : 'Private only'}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Evidence vault" subtitle="Proof that backs your career claims" right={addButton} />
      {content}
    </SafeAreaView>
  );
}
