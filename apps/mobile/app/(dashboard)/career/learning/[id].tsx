import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useConvertMilestone, useSkillReport, useToggleMilestone } from '../../../../src/hooks/career/learning';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import {
  evidenceErrorMessage,
  IMPORTANCE_LABEL,
  IMPORTANCE_TONE,
  isOpenableUrl,
  levelLabel,
  milestoneDone,
  milestoneEffort,
  progressErrorMessage,
  reportMeta,
} from '../../../../src/lib/career/learning';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

/**
 * One learning plan, as on the website: progress, skill gaps, milestones
 * (ticking is free), resources, and the optional project brief with rubrics.
 * A ticked milestone can be added to the evidence vault as a self-reported
 * project item.
 */
export default function LearningPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const access = useCareerAccess();
  const report = useSkillReport(id);
  const toggle = useToggleMilestone(id);
  const convert = useConvertMilestone(id);
  const [converting, setConverting] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);

  const onToggle = (milestoneId: string, completed: boolean) => {
    toggle.mutate({ milestoneId, completed }, { onError: (error) => Alert.alert('Not updated', progressErrorMessage(error)) });
  };

  const onConvert = (milestoneId: string, title: string) => {
    if (converting) return;
    Alert.alert('Add to evidence?', `“${title}” will be added to your evidence as a self-reported project. You can edit or delete it there.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add',
        onPress: () => {
          setConverting(milestoneId);
          convert.mutate(milestoneId, {
            onSuccess: () => setAdded((prev) => [...prev, milestoneId]),
            onError: (error) => Alert.alert('Not added', evidenceErrorMessage(error)),
            onSettled: () => setConverting(null),
          });
        },
      },
    ]);
  };

  const openResource = (url: string) => {
    if (!isOpenableUrl(url)) return;
    void WebBrowser.openBrowserAsync(url).catch(() => Alert.alert('Could not open link', 'Try again later.'));
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (report.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (report.error || !report.data) {
    content = <ErrorState message={careerErrorMessage(report.error, 'Could not open this learning plan.')} onRetry={() => void report.refetch()} />;
  } else {
    const r = report.data;
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={report.isRefetching && !report.isPlaceholderData} onRefresh={() => void report.refetch()} tintColor={colors.brand[600]} />}
      >
        {added.length > 0 ? (
          <View className="bg-success-bg rounded-xl p-3 mb-4 flex-row items-center" accessibilityLiveRegion="polite">
            <Text className="flex-1 text-success text-sm mr-2">Added to your evidence.</Text>
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/career/evidence' as Href)}
              className="min-h-[44px] justify-center px-2"
              accessibilityRole="link"
            >
              <Text className="text-success text-sm font-bold underline">View evidence</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Card>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 mr-2">
              <Text className="text-lg font-bold text-stone-900">{r.targetRole}</Text>
              <Text className="text-brand-700 text-sm font-medium mt-0.5">{reportMeta(r)}</Text>
            </View>
            <View className="items-end">
              <Text className="text-stone-500 text-xs font-semibold">Progress</Text>
              <Text className="text-lg font-black text-stone-900">{`${r.progress.percent}%`}</Text>
            </View>
          </View>
          <View
            className="h-2.5 bg-stone-100 rounded-full mt-3 overflow-hidden"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: r.progress.percent }}
            accessibilityLabel="Plan progress"
          >
            <View className="h-2.5 bg-brand-500 rounded-full" style={{ width: `${r.progress.percent}%` }} />
          </View>
          {r.skillGaps.length > 0 ? (
            <>
              <SectionLabel>Skill gaps</SectionLabel>
              {r.skillGaps.map((gap) => (
                <View key={gap.skill} className="border border-stone-100 rounded-xl p-3 mb-2 flex-row items-center">
                  <View className="flex-1 mr-2">
                    <Text className="text-sm font-semibold text-stone-900">{gap.skill}</Text>
                    <Text className="text-xs text-stone-500 mt-0.5">{`Current: ${levelLabel(gap.currentLevel)} → Required: ${levelLabel(gap.requiredLevel)}`}</Text>
                  </View>
                  <Pill label={IMPORTANCE_LABEL[gap.importance] ?? gap.importance.toUpperCase()} tone={IMPORTANCE_TONE[gap.importance] ?? 'default'} />
                </View>
              ))}
            </>
          ) : null}
        </Card>

        <Card>
          <Text className="text-base font-bold text-stone-900">Milestones</Text>
          <Text className="text-stone-500 text-xs mt-0.5 mb-3">Tick milestones as you finish courses or reading. Ticking is always free.</Text>
          {r.learningPlan.map((m, idx) => {
            const done = milestoneDone(r, m.id);
            const isAdded = added.includes(m.id);
            return (
              <View key={m.id} className={`border border-stone-100 rounded-xl p-3 mb-3 ${done ? 'bg-stone-50' : 'bg-white'}`}>
                <TouchableOpacity
                  onPress={() => onToggle(m.id, !done)}
                  className="flex-row items-start min-h-[44px]"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={`Milestone ${idx + 1}: ${m.title}`}
                  activeOpacity={0.7}
                >
                  <Ionicons name={done ? 'checkbox' : 'square-outline'} size={22} color={done ? colors.brand[600] : colors.stone[400]} />
                  <View className="flex-1 ml-3">
                    <Text className={`text-sm font-semibold ${done ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{`${idx + 1}. ${m.title}`}</Text>
                    {m.description ? <Text className="text-xs text-stone-600 mt-0.5 leading-4">{m.description}</Text> : null}
                    <Text className="text-xs text-stone-400 mt-1">{`${m.targetSkill} · ${milestoneEffort(m)}`}</Text>
                  </View>
                </TouchableOpacity>
                {m.resources.length > 0 ? (
                  <View className="mt-2 ml-8">
                    <Text className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1">Resources</Text>
                    {m.resources.map((res) => (
                      <TouchableOpacity
                        key={res.url}
                        onPress={() => openResource(res.url)}
                        disabled={!isOpenableUrl(res.url)}
                        className="flex-row items-center min-h-[44px]"
                        accessibilityRole="link"
                        accessibilityLabel={`${res.title}, ${res.provider}, ${res.isFree ? 'free' : 'paid'}. Opens in the browser.`}
                      >
                        <Text className="flex-1 text-sm text-brand-700 font-medium mr-2" numberOfLines={2}>
                          {`${res.title} `}
                          <Text className="text-stone-400 font-normal">{`(${res.provider})`}</Text>
                        </Text>
                        <Text className="text-xs text-stone-400 mr-1">{res.isFree ? 'Free' : 'Paid'}</Text>
                        <Ionicons name="open-outline" size={14} color={colors.stone[400]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {done ? (
                  <View className="mt-2 ml-8">
                    {isAdded ? (
                      <Text className="text-success text-xs font-semibold py-2">Added to your evidence</Text>
                    ) : (
                      <Button variant="outline" size="sm" onPress={() => onConvert(m.id, m.title)} loading={converting === m.id} disabled={converting !== null}>
                        Add to evidence
                      </Button>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>

        {r.projectBrief ? (
          <Card>
            <Text className="text-base font-bold text-stone-900">{r.projectBrief.title}</Text>
            <Text className="text-sm text-stone-700 mt-1 leading-5">{r.projectBrief.summary}</Text>
            <Text className="text-xs text-stone-400 mt-1">{`Estimated effort: ~${r.projectBrief.estimatedHours} hours`}</Text>
            <SectionLabel>Requirements</SectionLabel>
            {r.projectBrief.requirements.map((req, i) => (
              <BulletText key={i} text={req} />
            ))}
            <SectionLabel>Deliverables</SectionLabel>
            {r.projectBrief.deliverables.map((del, i) => (
              <BulletText key={i} text={del} />
            ))}
            <SectionLabel>Evaluation rubrics</SectionLabel>
            {r.projectBrief.rubrics.map((rubric) => (
              <View key={rubric.id} className="border-t border-stone-100 py-2 flex-row">
                <View className="flex-1 mr-2">
                  <Text className="text-sm font-semibold text-stone-900">{rubric.name}</Text>
                  <Text className="text-xs text-stone-500 mt-0.5 leading-4">{rubric.description}</Text>
                </View>
                <Text className="text-sm font-bold text-brand-700">{`${rubric.weight}%`}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={report.data?.targetRole ?? 'Learning plan'} subtitle="Learning plan" />
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

function BulletText({ text }: { text: string }) {
  return (
    <View className="flex-row items-start mb-1">
      <Text className="text-stone-400 text-sm w-4">•</Text>
      <Text className="flex-1 text-stone-700 text-sm leading-5">{text}</Text>
    </View>
  );
}
