import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TemplateCard } from '../../../src/components/templates/TemplateCard';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { Button } from '../../../src/components/ui/Button';
import { useTemplates } from '../../../src/hooks/useTemplates';
import { useCreateCV } from '../../../src/hooks/useCVs';
import { useAuthStore } from '../../../src/store/auth-store';
import { useCVStore } from '../../../src/store/cv-store';
import { Template } from '../../../src/types/template.types';
import { TemplateCategory, CVStatus, FontSize, Spacing, SubscriptionPlan } from '../../../src/types/enums';
import { canAccessTemplate, canCreateCV } from '../../../src/lib/utils';

export default function NewCVScreen() {
  const router = useRouter();
  const { template: queryTemplate } = useLocalSearchParams<{ template?: string }>();
  const { user } = useAuthStore();
  const { setCV, setSections } = useCVStore();
  const { data: templates, isLoading } = useTemplates(TemplateCategory.CV);
  const createCV = useCreateCV();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(queryTemplate ?? null);
  const [step, setStep] = useState<'template' | 'title'>('template');
  const [cvTitle, setCvTitle] = useState('My Professional CV');

  const plan = user?.subscription?.plan ?? SubscriptionPlan.FREE;

  const handleSelectTemplate = (template: Template) => {
    if (!canAccessTemplate(plan, template.tier)) {
      Alert.alert(
        'Upgrade Required',
        `The ${template.name} template requires a ${template.tier} plan.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/(dashboard)/settings/billing') },
        ],
      );
      return;
    }
    setSelectedTemplateId(template.id);
  };

  const handleCreate = async () => {
    if (!user) return;

    if (!canCreateCV(plan, user?.usage?.cvsCreated)) {
      Alert.alert(
        'CV Limit Reached',
        `Your ${plan} plan allows up to ${plan === SubscriptionPlan.FREE ? 5 : 10} CVs. Upgrade to create more.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/(dashboard)/settings/billing') },
        ],
      );
      return;
    }

    try {
      const selectedTemplate = templates?.find((t) => t.id === selectedTemplateId) ?? templates?.[0];
      const newCV = await createCV.mutateAsync({
        title: cvTitle,
        templateId: selectedTemplate?.id ?? 'modern',
        status: CVStatus.DRAFT,
        isPublic: false,
        personalInfo: {
          firstName: user.profile?.firstName ?? '',
          lastName: user.profile?.lastName ?? '',
          email: user.email ?? '',
          phone: '',
        },
        styling: {
          primaryColor: selectedTemplate?.colorSchemes?.[0]?.primary ?? '#2563eb',
          fontFamily: selectedTemplate?.fontOptions?.[0] ?? 'Inter',
          fontSize: FontSize.MEDIUM,
          spacing: Spacing.NORMAL,
          showPhoto: false,
        },
        sectionOrder: [],
      });

      setCV(newCV);
      setSections([]);
      router.replace(`/(dashboard)/cvs/${newCV.id}`);
    } catch {
      Alert.alert('Error', 'Failed to create CV. Please try again.');
    }
  };

  if (step === 'template') {
    return (
      <SafeAreaView className="flex-1 bg-stone-50">
        <View className="px-5 pt-4 pb-4 bg-white border-b border-stone-100">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} className="mr-3">
              <Ionicons name="arrow-back" size={22} color="#374151" />
            </TouchableOpacity>
            <View>
              <Text className="text-xl font-black text-stone-900">Choose Template</Text>
              <Text className="text-stone-400 text-sm">Pick a design to get started</Text>
            </View>
          </View>
        </View>

        {isLoading ? (
          <View className="p-5">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </View>
        ) : (
          <FlatList
            data={templates ?? []}
            numColumns={2}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16 }}
            columnWrapperStyle={{ gap: 12 }}
            ItemSeparatorComponent={() => <View className="h-3" />}
            renderItem={({ item }) => (
              <View className="flex-1">
                <TemplateCard
                  template={item}
                  isSelected={selectedTemplateId === item.id}
                  isLocked={!canAccessTemplate(plan, item.tier)}
                  onSelect={() => handleSelectTemplate(item)}
                />
              </View>
            )}
          />
        )}

        {selectedTemplateId && (
          <View className="px-5 py-4 bg-white border-t border-stone-100">
            <Button variant="primary" fullWidth size="lg" onPress={() => setStep('title')}>
              Continue with this template
            </Button>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-5 pt-4">
        <TouchableOpacity onPress={() => setStep('template')} className="flex-row items-center mb-6">
          <Ionicons name="arrow-back" size={22} color="#374151" />
          <Text className="text-stone-700 ml-2 font-medium">Back to Templates</Text>
        </TouchableOpacity>

        <Text className="text-2xl font-black text-stone-900 mb-2">Name your CV</Text>
        <Text className="text-stone-500 mb-6">Give it a memorable name to find it easily later.</Text>

        <View className="border-2 border-brand-500 rounded-xl px-4 py-3 mb-8">
          <Text className="text-lg font-semibold text-stone-900">{cvTitle}</Text>
        </View>

        {['My Professional CV', 'Software Engineer CV', 'Product Manager CV', 'Marketing CV', 'Designer CV'].map((suggestion) => (
          <TouchableOpacity
            key={suggestion}
            onPress={() => setCvTitle(suggestion)}
            className={['flex-row items-center px-4 py-3 rounded-xl border mb-2', cvTitle === suggestion ? 'border-brand-500 bg-brand-50' : 'border-stone-200'].join(' ')}
          >
            <Text className={cvTitle === suggestion ? 'text-brand-700 font-semibold' : 'text-stone-700'}>
              {suggestion}
            </Text>
          </TouchableOpacity>
        ))}

        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={createCV.isPending}
          className="mt-6"
          onPress={handleCreate}
        >
          Create CV
        </Button>
      </View>
    </SafeAreaView>
  );
}
