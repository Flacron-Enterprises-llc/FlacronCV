import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TemplateCard } from '../../../src/components/templates/TemplateCard';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useTemplates } from '../../../src/hooks/useTemplates';
import { useAuthStore } from '../../../src/store/auth-store';
import { SubscriptionPlan, TemplateCategory } from '../../../src/types/enums';
import { canAccessTemplate } from '../../../src/lib/utils';
import { Template } from '../../../src/types/template.types';

type FilterTab = 'all' | 'free' | 'pro';

export default function TemplatesScreen() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: templates, isLoading } = useTemplates(TemplateCategory.CV);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const plan = user?.subscription?.plan ?? SubscriptionPlan.FREE;

  const filtered = templates?.filter((t) => {
    if (activeFilter === 'free') return t.tier === SubscriptionPlan.FREE;
    if (activeFilter === 'pro') return t.tier !== SubscriptionPlan.FREE;
    return true;
  }) ?? [];

  const handleSelectTemplate = (template: Template) => {
    router.push(`/(dashboard)/cvs/new?template=${template.id}`);
  };

  return (
    <SafeAreaView className="flex-1 bg-stone-50">
      <View className="px-5 pt-4 pb-3 bg-white border-b border-stone-100">
        <Text className="text-xl font-black text-stone-900">Templates</Text>
        <Text className="text-stone-400 text-sm mt-0.5">Choose a professional design</Text>
      </View>

      {/* Filter Tabs */}
      <View className="flex-row px-5 py-3 bg-white gap-2 border-b border-stone-100">
        {(['all', 'free', 'pro'] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => setActiveFilter(tab)}
            className={['px-4 py-2 rounded-full capitalize', activeFilter === tab ? 'bg-brand-500' : 'bg-stone-100'].join(' ')}
          >
            <Text className={['text-sm font-semibold capitalize', activeFilter === tab ? 'text-white' : 'text-stone-600'].join(' ')}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View className="p-5">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </View>
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
                isLocked={!canAccessTemplate(plan, item.tier)}
                onSelect={() => handleSelectTemplate(item)}
              />
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
