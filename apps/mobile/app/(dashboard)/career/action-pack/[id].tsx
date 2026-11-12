import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useActionPack, useToggleChecklist } from '../../../../src/hooks/career/action-packs';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { checklistErrorMessage, checklistProgress, fitLabel, fitTone, organizationName } from '../../../../src/lib/career/action-packs';
import { careerErrorMessage, FACT_TYPE_LABEL, formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

/**
 * One action pack, as the website's detail column shows it: vacancy, fit
 * reasons and gaps, the preparation checklist (ticking is free), the tailored
 * cover letter, the tailored CV lines and the next steps.
 */
export default function ActionPackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useCareerAccess();
  const pack = useActionPack(id);
  const toggle = useToggleChecklist(id);

  const onToggle = (checklistId: string, done: boolean) => {
    toggle.mutate(
      { checklistId, done },
      { onError: (error) => Alert.alert('Not updated', checklistErrorMessage(error)) },
    );
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (pack.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (pack.error || !pack.data) {
    content = <ErrorState message={careerErrorMessage(pack.error, 'Could not open this action pack.')} onRetry={() => void pack.refetch()} />;
  } else {
    const p = pack.data;
    const progress = checklistProgress(p);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={pack.isRefetching && !pack.isPlaceholderData} onRefresh={() => void pack.refetch()} tintColor={colors.brand[600]} />}
      >
        <Card>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-2">
              <Text className="text-lg font-bold text-stone-900">{p.vacancySnapshot.title}</Text>
              <Text className="text-brand-700 text-sm font-medium mt-0.5">{organizationName(p.vacancySnapshot.organization)}</Text>
            </View>
            <Pill label={fitLabel(p.fit.fit)} tone={fitTone(p.fit.fit)} />
          </View>
          <Text className="text-stone-400 text-xs mt-2">
            {`Created ${formatDay(p.createdAt) ?? ''}${p.vacancySnapshot.deadline ? ` · Deadline ${formatDay(p.vacancySnapshot.deadline) ?? ''}` : ''}`}
          </Text>
          {p.vacancySnapshot.description ? (
            <>
              <SectionLabel>Vacancy overview</SectionLabel>
              <Text className="text-stone-700 text-sm leading-5" numberOfLines={6}>
                {p.vacancySnapshot.description}
              </Text>
            </>
          ) : null}
          <SectionLabel>Why you qualify</SectionLabel>
          {p.fit.reasons.length > 0 ? p.fit.reasons.map((r, i) => <Bullet key={i} icon="checkmark-circle-outline" color={colors.success.DEFAULT} text={r} />) : <Text className="text-stone-500 text-sm">No matching facts were found.</Text>}
          <SectionLabel>Skill and evidence gaps</SectionLabel>
          {p.fit.gaps.length > 0 ? p.fit.gaps.map((g, i) => <Bullet key={i} icon="alert-circle-outline" color={colors.warning.DEFAULT} text={g} />) : <Text className="text-stone-500 text-sm">No critical skill gaps detected.</Text>}
          {p.fit.unknowns.length > 0 ? (
            <>
              <SectionLabel>Not stated in the advert</SectionLabel>
              {p.fit.unknowns.map((u, i) => (
                <Bullet key={i} icon="help-circle-outline" color={colors.stone[400]} text={u} />
              ))}
            </>
          ) : null}
        </Card>

        <Card>
          <Text className="text-base font-bold text-stone-900">Preparation checklist</Text>
          <Text className="text-stone-500 text-xs mt-0.5 mb-3">{`${progress.done} of ${progress.total} done. Ticking items is free.`}</Text>
          {p.checklist.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => onToggle(item.id, !item.done)}
              className="flex-row items-start border border-stone-100 rounded-xl p-3 mb-2 min-h-[44px]"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              accessibilityLabel={item.label}
              activeOpacity={0.7}
            >
              <Ionicons name={item.done ? 'checkbox' : 'square-outline'} size={22} color={item.done ? colors.brand[600] : colors.stone[400]} />
              <Text className={`flex-1 ml-3 text-sm leading-5 ${item.done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </Card>

        <Card>
          <Text className="text-base font-bold text-stone-900 mb-2">Tailored cover letter</Text>
          <Text selectable className="text-stone-800 text-sm leading-6">
            {p.coverLetter.body}
          </Text>
        </Card>

        <Card>
          <Text className="text-base font-bold text-stone-900">Tailored CV content</Text>
          <Text className="text-stone-500 text-xs mt-0.5 mb-2">{`Confirmed facts included: ${p.tailoredResume.factIds.length}`}</Text>
          {p.tailoredResume.lines.map((line, idx) => (
            <View key={`${line.factId}-${idx}`} className="py-2 border-t border-stone-100">
              <Text className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">{FACT_TYPE_LABEL[line.factType] ?? line.factType}</Text>
              <Text selectable className="text-stone-800 text-sm mt-0.5 leading-5">
                {line.text}
              </Text>
            </View>
          ))}
        </Card>

        <Card>
          <Text className="text-base font-bold text-stone-900 mb-2">Recommended next steps</Text>
          {p.nextSteps.map((step, idx) => (
            <View key={idx} className="flex-row mb-2">
              <Text className="text-stone-500 text-sm w-6">{`${idx + 1}.`}</Text>
              <Text className="flex-1 text-stone-800 text-sm leading-5">{step}</Text>
            </View>
          ))}
        </Card>
        <Text className="text-stone-400 text-xs leading-4">Edit the full CV and letter in Career drafts on the website. Nothing here is sent anywhere.</Text>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={pack.data?.vacancySnapshot.title ?? 'Action pack'} subtitle="Action pack" />
      {content}
    </SafeAreaView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">{children}</View>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide mt-4 mb-1.5">{children}</Text>;
}

function Bullet({ icon, color, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string }) {
  return (
    <View className="flex-row items-start mb-1.5">
      <Ionicons name={icon} size={16} color={color} style={{ marginTop: 2 }} />
      <Text className="flex-1 ml-2 text-stone-700 text-sm leading-5">{text}</Text>
    </View>
  );
}
