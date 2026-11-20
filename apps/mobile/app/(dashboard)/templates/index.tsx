import axios from 'axios';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TemplateCard } from '../../../src/components/templates/TemplateCard';
import { TemplatePreviewModal } from '../../../src/components/templates/TemplatePreviewModal';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useTemplates } from '../../../src/hooks/useTemplates';
import { useAuthStore } from '../../../src/store/auth-store';
import { SubscriptionPlan, TemplateCategory } from '../../../src/types/enums';
import { canAccessTemplate, planForDisplay } from '../../../src/lib/entitlements';
import {
  lockedTemplateMessage,
  lockedTemplateTitle,
  PAID_UPGRADES_ENABLED,
  upgradeAlertButtons,
} from '../../../src/config/paid-upgrades';
import { Template } from '../../../src/types/template.types';
import { t as tNow, useT } from '../../../src/i18n';

type FilterTab = 'all' | 'free' | 'pro';

function loadFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return tNow('common.noConnection');
  }
  return tNow('templates.loadError');
}

export default function TemplatesScreen() {
  const router = useRouter();
  const t = useT('templates');
  const { user } = useAuthStore();
  const { data: templates, isLoading, error, refetch } = useTemplates(TemplateCategory.CV);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const subscription = user?.subscription;

  const catalogFailed = !!error;
  const catalogLoading = !catalogFailed && templates == null;

  const filtered = (templates ?? []).filter((t) => {
    if (activeFilter === 'free') return t.tier === SubscriptionPlan.FREE;
    if (activeFilter === 'pro') return t.tier !== SubscriptionPlan.FREE;
    return true;
  });

  const handleSelectTemplate = (template: Template) => {
    const plan = planForDisplay(subscription);
    if (!canAccessTemplate(subscription, template.tier)) {
      if (!PAID_UPGRADES_ENABLED) {
        Alert.alert(
          lockedTemplateTitle(template.tier),
          lockedTemplateMessage(template.name, template.tier, plan),
        );
        return;
      }
      Alert.alert(
        lockedTemplateTitle(template.tier),
        lockedTemplateMessage(template.name, template.tier, plan),
        upgradeAlertButtons(() => router.push('/(dashboard)/settings/plans')),
      );
      return;
    }
    router.push(`/(dashboard)/cvs/new?template=${template.id}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top']}>
      <View className="px-5 pt-4 pb-3 bg-surface border-b border-stone-100">
        <Text className="text-xl font-black text-stone-900">{t('title')}</Text>
        <Text className="text-stone-400 text-sm mt-0.5">{t('subtitle')}</Text>
      </View>

      {/* Filter Tabs */}
      <View className="flex-row px-5 py-3 bg-surface gap-2 border-b border-stone-100">
        {(['all', 'free', 'pro'] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveFilter(tab)}
            className={['px-4 py-2 rounded-full capitalize', activeFilter === tab ? 'bg-brand-500' : 'bg-stone-100'].join(' ')}
          >
            <Text className={['text-sm font-semibold capitalize', activeFilter === tab ? 'text-white' : 'text-stone-600'].join(' ')}>
              {tab === 'all' ? t('filters.all') : tab === 'free' ? t('filters.free') : t('filters.pro')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {catalogFailed ? (
        <ErrorState message={loadFailureMessage(error)} onRetry={() => void refetch()} />
      ) : catalogLoading || isLoading ? (
        <View className="p-5">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="layers-outline"
          title={
            activeFilter === 'all'
              ? t('empty.allTitle')
              : activeFilter === 'free'
                ? t('empty.freeTitle')
                : t('empty.proTitle')
          }
          description={activeFilter === 'all' ? t('empty.allBody') : t('empty.filteredBody')}
          actionLabel={activeFilter === 'all' ? undefined : t('empty.showAll')}
          onAction={activeFilter === 'all' ? undefined : () => setActiveFilter('all')}
        />
      ) : (
        <FlatList
          data={filtered}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16 }}
          columnWrapperStyle={{ gap: 12 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View className="flex-1">
              <TemplateCard
                template={item}
                isLocked={!canAccessTemplate(subscription, item.tier)}
                onSelect={() => handleSelectTemplate(item)}
                onPreview={() => setPreviewing(item)}
              />
            </View>
          )}
        />
      )}

      <TemplatePreviewModal
        template={previewing}
        onClose={() => setPreviewing(null)}
        userCanAccess={previewing ? canAccessTemplate(subscription, previewing.tier) : true}
        lockedMessage={
          previewing
            ? lockedTemplateMessage(previewing.name, previewing.tier, planForDisplay(subscription))
            : undefined
        }
        onSelect={() => {
          const chosen = previewing;
          setPreviewing(null);
          if (chosen) handleSelectTemplate(chosen);
        }}
        onUpgrade={() => {
          setPreviewing(null);
          router.push('/(dashboard)/settings/plans');
        }}
      />
    </SafeAreaView>
  );
}
