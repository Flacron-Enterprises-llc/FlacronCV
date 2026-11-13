import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TemplateCard } from '../../../src/components/templates/TemplateCard';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { CV_TITLE_MAX, validateCvTitle } from '../../../src/lib/cv-editor';
import { t as tNow, useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';
import { useTemplates } from '../../../src/hooks/useTemplates';
import { useCreateCV } from '../../../src/hooks/useCVs';
import { useAuthStore } from '../../../src/store/auth-store';
import { useCVStore } from '../../../src/store/cv-store';
import { Template } from '../../../src/types/template.types';
import { TemplateCategory, CVStatus, FontSize, Spacing } from '../../../src/types/enums';
import { canAccessTemplate, canCreateCV, effectivePlanForCopy } from '../../../src/lib/entitlements';
import { isLimitRejection, requestFailureMessage } from '../../../src/lib/api-errors';
import { alertIfUnverifiedEmail } from '../../../src/lib/email-verification';
import {
  cvLimitReachedMessage,
  lockedTemplateMessage,
  lockedTemplateTitle,
  PAID_UPGRADES_ENABLED,
  upgradeAlertButtons,
} from '../../../src/config/paid-upgrades';
import { colors } from '../../../src/theme/colors';

function loadFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return tNow('common.noConnection');
  }
  return tNow('templates.loadError');
}

export default function NewCVScreen() {
  const router = useRouter();
  const t = useT('cvs');
  const titleSuggestions = [
    t('new.suggestion.professional'),
    t('new.suggestion.softwareEngineer'),
    t('new.suggestion.productManager'),
    t('new.suggestion.marketing'),
    t('new.suggestion.designer'),
  ];
  const { template: queryTemplate } = useLocalSearchParams<{ template?: string }>();
  const { user } = useAuthStore();
  const { setCV, setSections } = useCVStore();
  const { data: templates, isLoading, error, refetch } = useTemplates(TemplateCategory.CV);
  const createCV = useCreateCV();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(queryTemplate ?? null);
  const [step, setStep] = useState<'template' | 'title'>('template');
  const [cvTitle, setCvTitle] = useState('');
  const [titleError, setTitleError] = useState<string | undefined>();

  const subscription = user?.subscription;

  useEffect(() => {
    if (PAID_UPGRADES_ENABLED || !queryTemplate || !templates) return;
    const t = templates.find((x) => x.id === queryTemplate);
    if (t && !canAccessTemplate(user?.subscription, t.tier)) {
      setSelectedTemplateId(null);
    }
  }, [
    queryTemplate,
    templates,
    user?.subscription?.plan,
    user?.subscription?.status,
    user?.subscription?.currentPeriodEnd,
    user?.subscription?.cancelAtPeriodEnd,
  ]);

  const handleSelectTemplate = (template: Template) => {
    const plan = effectivePlanForCopy(subscription);
    if (!canAccessTemplate(subscription, template.tier)) {
      Alert.alert(
        lockedTemplateTitle(template.tier),
        lockedTemplateMessage(template.name, template.tier, plan),
        upgradeAlertButtons(() => router.push('/(dashboard)/settings/billing')),
      );
      return;
    }
    setSelectedTemplateId(template.id);
  };

  const handleCreate = async () => {
    // Same rule as the website's "Start from scratch": a non-blank title, at most 200 characters.
    const titleCheck = validateCvTitle(cvTitle);
    if (!titleCheck.ok) {
      setTitleError(titleCheck.error);
      return;
    }

    if (!user?.usage) {
      Alert.alert(
        t('new.createFailedTitle'),
        t('new.usageFailed'),
      );
      return;
    }

    if (!canCreateCV(subscription, user.usage.cvsCreated)) {
      Alert.alert(
        t('limitTitle'),
        cvLimitReachedMessage(effectivePlanForCopy(subscription)),
        upgradeAlertButtons(() => router.push('/(dashboard)/settings/billing')),
      );
      return;
    }

    try {
      const selectedTemplate = templates?.find((t) => t.id === selectedTemplateId) ?? templates?.[0];
      if (
        !PAID_UPGRADES_ENABLED &&
        selectedTemplate &&
        !canAccessTemplate(subscription, selectedTemplate.tier)
      ) {
        Alert.alert(
          lockedTemplateTitle(selectedTemplate.tier),
          lockedTemplateMessage(
            selectedTemplate.name,
            selectedTemplate.tier,
            effectivePlanForCopy(subscription),
          ),
        );
        return;
      }
      const newCV = await createCV.mutateAsync({
        title: titleCheck.title,
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
          primaryColor: selectedTemplate?.colorSchemes?.[0]?.primary ?? colors.brand[600],
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
    } catch (err) {
      if (alertIfUnverifiedEmail(err)) return;
      if (isLimitRejection(err)) {
        Alert.alert(
          t('limitTitle'),
          cvLimitReachedMessage(effectivePlanForCopy(subscription)),
          upgradeAlertButtons(() => router.push('/(dashboard)/settings/billing')),
        );
        return;
      }
      Alert.alert(
        t('new.createFailedTitle'),
        requestFailureMessage(err, t('new.createFailed')),
      );
    }
  };

  if (step === 'template') {
    return (
      <SafeAreaView className="flex-1 bg-stone-50">
        <View className="px-5 pt-4 pb-4 bg-white border-b border-stone-100">
          <View className="flex-row items-center">
            <TouchableOpacity onPress={() => router.back()} className="me-3" accessibilityRole="button" accessibilityLabel={t('new.back')}>
              <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
            </TouchableOpacity>
            <View>
              <Text className="text-xl font-black text-stone-900">{t('new.chooseTitle')}</Text>
              <Text className="text-stone-400 text-sm">{t('new.chooseSubtitle')}</Text>
            </View>
          </View>
        </View>

        {error ? (
          <ErrorState message={loadFailureMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading || templates == null ? (
          <View className="p-5">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </View>
        ) : (
          <FlatList
            data={templates}
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
                  isLocked={!canAccessTemplate(subscription, item.tier)}
                  onSelect={() => handleSelectTemplate(item)}
                />
              </View>
            )}
          />
        )}

        {selectedTemplateId && (
          <View className="px-5 py-4 bg-white border-t border-stone-100">
            <Button variant="primary" fullWidth size="lg" onPress={() => setStep('title')}>
              {t('new.continue')}
            </Button>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => setStep('template')}
            accessibilityRole="button"
            className="flex-row items-center mb-6"
            style={{ minHeight: 44 }}
          >
            <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
            <Text className="text-stone-700 ms-2 font-medium">{t('new.backToTemplates')}</Text>
          </TouchableOpacity>

          <Text className="text-2xl font-black text-stone-900 mb-2">{t('new.nameTitle')}</Text>
          <Text className="text-stone-500 mb-6">{t('new.nameBody')}</Text>

          <Input
            label={t('new.titleLabel')}
            placeholder={t('new.titlePlaceholder')}
            value={cvTitle}
            onChangeText={(text) => {
              setCvTitle(text);
              if (titleError) setTitleError(undefined);
            }}
            maxLength={CV_TITLE_MAX}
            error={titleError}
            hint={`${cvTitle.length}/${CV_TITLE_MAX}`}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void handleCreate()}
            accessibilityLabel={t('new.titleLabel')}
          />

          <Text className="text-sm font-medium text-stone-500 mb-2">{t('new.suggestions')}</Text>
          <View className="flex-row flex-wrap gap-2 mb-2">
            {titleSuggestions.map((suggestion) => {
              const active = cvTitle === suggestion;
              return (
                <TouchableOpacity
                  key={suggestion}
                  onPress={() => {
                    setCvTitle(suggestion);
                    setTitleError(undefined);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t('new.useSuggestion', { title: suggestion })}
                  className={['px-4 rounded-full border justify-center', active ? 'border-brand-500 bg-brand-50' : 'border-stone-200'].join(' ')}
                  style={{ minHeight: 44 }}
                >
                  <Text className={active ? 'text-brand-700 font-semibold' : 'text-stone-700'}>
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            loading={createCV.isPending}
            className="mt-6"
            onPress={handleCreate}
          >
            {t('new.create')}
          </Button>
          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
