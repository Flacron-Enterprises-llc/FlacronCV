import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { ProjectBriefCard } from '../../../../src/components/career/plans/ProjectBriefCard';
import { Button } from '../../../../src/components/ui/Button';
import { Input } from '../../../../src/components/ui/Input';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useConvertMilestone, useSkillReport, useToggleMilestone } from '../../../../src/hooks/career/learning';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import {
  evidenceErrorMessage,
  evidenceResultMessage,
  gapBadge,
  hasEssentialCredential,
  isOpenableUrl,
  levelLabel,
  milestoneDone,
  milestoneEffort,
  milestoneEvidenceId,
  OWNERSHIP_MAX,
  planCostLine,
  progressErrorMessage,
  reportMeta,
} from '../../../../src/lib/career/learning';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';

/**
 * One learning plan, as on the website: progress, skill gaps (essential vs
 * preferred), transferable skills, bridge roles, milestones
 * (ticking is free) with cost dates and prerequisites, resources, and the
 * project brief (AI-assisted marker, ownership statement, rubric self-check).
 * A ticked milestone can be added to the evidence vault as a self-reported
 * project item, once (the server remembers it). An unknown course cost is
 * shown as unknown and never counted as free.
 */
export default function LearningPlanScreen() {
  const t = useT('careerPlans');
  const tc = useT('common');
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const access = useCareerAccess();
  const report = useSkillReport(id);
  const toggle = useToggleMilestone(id);
  const convert = useConvertMilestone(id);
  const [converting, setConverting] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // The milestone whose "add to vault" form is open, and the person's own words for it (optional, never written for them).
  const [ownershipFor, setOwnershipFor] = useState<string | null>(null);
  const [statement, setStatement] = useState('');

  const onToggle = (milestoneId: string, completed: boolean) => {
    toggle.mutate({ milestoneId, completed }, { onError: (error) => Alert.alert(t('notUpdated'), progressErrorMessage(error)) });
  };

  const onConvert = (milestoneId: string) => {
    if (converting) return;
    setConverting(milestoneId);
    const ownershipStatement = statement.trim() || undefined;
    convert.mutate(
      { milestoneId, ownershipStatement },
      {
        onSuccess: (result) => {
          setJustAdded(evidenceResultMessage(result.created));
          setOwnershipFor(null);
          setStatement('');
        },
        onError: (error) => Alert.alert(t('learning.notAdded'), evidenceErrorMessage(error)),
        onSettled: () => setConverting(null),
      },
    );
  };

  const openResource = (url: string) => {
    if (!isOpenableUrl(url)) return;
    void WebBrowser.openBrowserAsync(url).catch(() => Alert.alert(t('learning.linkError'), t('learning.tryLater')));
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('lockedTitle')} />;
  } else if (report.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (report.error || !report.data) {
    content = <ErrorState message={careerErrorMessage(report.error, t('learning.openError'))} onRetry={() => void report.refetch()} />;
  } else {
    const r = report.data;
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={report.isRefetching && !report.isPlaceholderData} onRefresh={() => void report.refetch()} tintColor={colors.brand[600]} />}
      >
        {justAdded ? (
          <View className="bg-success-bg rounded-xl p-3 mb-4 flex-row items-center" accessibilityLiveRegion="polite">
            <Text className="flex-1 text-success text-sm me-2">{justAdded}</Text>
            <TouchableOpacity
              onPress={() => router.push('/(dashboard)/career/evidence' as Href)}
              className="min-h-[44px] justify-center px-2"
              accessibilityRole="link"
            >
              <Text className="text-success text-sm font-bold underline">{t('learning.viewEvidence')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Card>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 me-2">
              <Text className="text-lg font-bold text-stone-900">{r.targetRole}</Text>
              <Text className="text-brand-700 text-sm font-medium mt-0.5">{reportMeta(r)}</Text>
              <Text className="text-stone-500 text-xs mt-1 leading-4">{planCostLine(r)}</Text>
            </View>
            <View className="items-end">
              <Text className="text-stone-500 text-xs font-semibold">{t('learning.progress')}</Text>
              <Text className="text-lg font-black text-stone-900">{`${r.progress.percent}%`}</Text>
            </View>
          </View>
          <View
            className="h-2.5 bg-stone-100 rounded-full mt-3 overflow-hidden"
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: r.progress.percent }}
            accessibilityLabel={t('learning.progressA11y')}
          >
            <View className="h-2.5 bg-brand-500 rounded-full" style={{ width: `${r.progress.percent}%` }} />
          </View>
          {r.skillGaps.length > 0 ? (
            <>
              <SectionLabel>{t('learning.skillGaps')}</SectionLabel>
              {r.skillGaps.map((gap) => {
                const badge = gapBadge(gap);
                return (
                  <View key={gap.skill} className="border border-stone-100 rounded-xl p-3 mb-2 flex-row items-center">
                    <View className="flex-1 me-2">
                      <Text className="text-sm font-semibold text-stone-900">{gap.skill}</Text>
                      <Text className="text-xs text-stone-500 mt-0.5">{t('learning.levels', { current: levelLabel(gap.currentLevel), required: levelLabel(gap.requiredLevel) })}</Text>
                    </View>
                    <Pill label={badge.label} tone={badge.tone} />
                  </View>
                );
              })}
              {hasEssentialCredential(r) ? <Text className="text-xs text-stone-500 leading-4">{t('learning.essentialCredentialHint')}</Text> : null}
            </>
          ) : null}
          {(r.transferableSkills?.length ?? 0) > 0 ? (
            <>
              <SectionLabel>{t('learning.transferableSkills')}</SectionLabel>
              <Text className="text-xs text-stone-500 mb-1.5">{t('learning.transferableSkillsHint')}</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {r.transferableSkills!.map((item) => (
                  <Pill key={item.skill} label={item.skill} tone="success" />
                ))}
              </View>
            </>
          ) : null}
          {(r.bridgeRoles?.length ?? 0) > 0 ? (
            <>
              <SectionLabel>{t('learning.bridgeRoles')}</SectionLabel>
              {r.bridgeRoles!.map((role) => (
                <View key={role.title} className="mb-1.5">
                  <Text className="text-sm font-semibold text-stone-900">{role.title}</Text>
                  {role.reason ? <Text className="text-xs text-stone-500 leading-4">{role.reason}</Text> : null}
                </View>
              ))}
            </>
          ) : null}
        </Card>

        <Card>
          <Text className="text-base font-bold text-stone-900">{t('learning.milestones')}</Text>
          <Text className="text-stone-500 text-xs mt-0.5">{t('learning.milestonesHint')}</Text>
          <Text className="text-stone-500 text-xs mt-0.5 mb-3">{t('learning.completionNotCredential')}</Text>
          {r.learningPlan.map((m, idx) => {
            const done = milestoneDone(r, m.id);
            const isAdded = milestoneEvidenceId(r, m.id) !== null;
            return (
              <View key={m.id} className={`border border-stone-100 rounded-xl p-3 mb-3 ${done ? 'bg-stone-50' : 'bg-surface'}`}>
                <TouchableOpacity
                  onPress={() => onToggle(m.id, !done)}
                  className="flex-row items-start min-h-[44px]"
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: done }}
                  accessibilityLabel={t('learning.milestoneA11y', { number: idx + 1, title: m.title })}
                  activeOpacity={0.7}
                >
                  <Ionicons name={done ? 'checkbox' : 'square-outline'} size={22} color={done ? colors.brand[600] : colors.stone[400]} />
                  <View className="flex-1 ms-3">
                    <Text className={`text-sm font-semibold ${done ? 'text-stone-400 line-through' : 'text-stone-900'}`}>{`${idx + 1}. ${m.title}`}</Text>
                    {m.description ? <Text className="text-xs text-stone-600 mt-0.5 leading-4">{m.description}</Text> : null}
                    <Text className="text-xs text-stone-400 mt-1">{`${m.targetSkill} · ${milestoneEffort(m)}`}</Text>
                    {m.prerequisites && m.prerequisites.length > 0 ? (
                      <Text className="text-xs text-stone-500 mt-1">{`${t('learning.prerequisites')}: ${m.prerequisites.join(', ')}`}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
                {m.resources.length > 0 ? (
                  <View className="mt-2 ms-8">
                    <Text className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1">{t('learning.resources')}</Text>
                    {m.resources.map((res) => (
                      <TouchableOpacity
                        key={res.url}
                        onPress={() => openResource(res.url)}
                        disabled={!isOpenableUrl(res.url)}
                        className="flex-row items-center min-h-[44px]"
                        accessibilityRole="link"
                        accessibilityLabel={t(res.isFree ? 'learning.resourceA11yFree' : 'learning.resourceA11yPaid', { title: res.title, provider: res.provider })}
                      >
                        <Text className="flex-1 text-sm text-brand-700 font-medium me-2" numberOfLines={2}>
                          {`${res.title} `}
                          <Text className="text-stone-400 font-normal">{`(${res.provider})`}</Text>
                        </Text>
                        <Text className="text-xs text-stone-400 me-1">{res.isFree ? t('learning.free') : t('learning.paid')}</Text>
                        <Ionicons name="open-outline" size={14} color={colors.stone[400]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {done ? (
                  <View className="mt-2 ms-8">
                    {isAdded ? (
                      <Text className="text-success text-xs font-semibold py-2">{t('learning.added')}</Text>
                    ) : ownershipFor === m.id ? (
                      <View>
                        <Text className="text-xs text-stone-600 mb-1">{t('learning.addConfirmBody', { title: m.title })}</Text>
                        <Input
                          label={t('brief.milestone_ownership_label')}
                          value={statement}
                          onChangeText={setStatement}
                          maxLength={OWNERSHIP_MAX}
                          multiline
                          textAlignVertical="top"
                          style={{ minHeight: 60 }}
                          hint={t('brief.milestone_ownership_hint')}
                          editable={converting === null}
                        />
                        <View className="flex-row gap-2">
                          <View className="flex-1">
                            <Button variant="outline" size="sm" fullWidth onPress={() => setOwnershipFor(null)} disabled={converting !== null}>
                              {tc('cancel')}
                            </Button>
                          </View>
                          <View className="flex-1">
                            <Button size="sm" fullWidth onPress={() => onConvert(m.id)} loading={converting === m.id} disabled={converting !== null}>
                              {t('brief.confirm_add_to_vault')}
                            </Button>
                          </View>
                        </View>
                      </View>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onPress={() => {
                          setOwnershipFor(m.id);
                          setStatement('');
                        }}
                        disabled={converting !== null}
                      >
                        {t('learning.addToEvidence')}
                      </Button>
                    )}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>

        {r.projectBrief ? <ProjectBriefCard report={r} /> : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={report.data?.targetRole ?? t('learning.detailSubtitle')} subtitle={t('learning.detailSubtitle')} />
      {content}
    </SafeAreaView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4">{children}</View>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide mt-4 mb-1.5">{children}</Text>;
}
