import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import { RefreshControl, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { Modal } from '../../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCreateSkillReport, useSkillReports } from '../../../../src/hooks/career/learning';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import { creditsLeft, keyForAction, type KeyedAction } from '../../../../src/lib/career/action-packs';
import {
  buildSkillReportInput,
  clampTimeBudget,
  EMPTY_SKILL_REPORT_FORM,
  reportMeta,
  skillReportErrorMessage,
  skillReportSignature,
  TIME_BUDGET_MAX,
  TIME_BUDGET_MIN,
  type SkillReportForm,
} from '../../../../src/lib/career/learning';
import { careerErrorMessage, formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

/**
 * Skill gaps and learning plans, as on the website (career/learning): set a
 * target role and the career service compares it with your confirmed facts,
 * then builds milestones, resources and an optional capstone brief. One
 * skill-report credit per plan; ticking milestones is free.
 */
export default function LearningScreen() {
  const router = useRouter();
  const access = useCareerAccess();
  const list = useSkillReports();
  const create = useCreateSkillReport();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SkillReportForm>(EMPTY_SKILL_REPORT_FORM);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const action = useRef<KeyedAction | null>(null);

  const dirty = open && (form.targetRole.trim() !== '' || form.targetIndustry.trim() !== '');
  useLeaveGuard(dirty);

  const featureOff = access.data?.enabled === true && access.data.features?.skillReports === false;
  const set = (patch: Partial<SkillReportForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setFieldError(null);
  };

  const onCreate = () => {
    if (create.isPending) return;
    const built = buildSkillReportInput(form);
    if (!built.ok) {
      setFieldError({ field: built.field, message: built.message });
      return;
    }
    // A retry of the same plan request reuses the key, so it is never charged twice.
    action.current = keyForAction(action.current, skillReportSignature(built.input), () => Crypto.randomUUID());
    setCreateError(null);
    create.mutate(
      { body: built.input, idempotencyKey: action.current.key },
      {
        onSuccess: (paid) => {
          action.current = null;
          setOpen(false);
          setForm(EMPTY_SKILL_REPORT_FORM);
          router.push(`/(dashboard)/career/learning/${paid.report.id}` as Href);
        },
        onError: (error) => setCreateError(skillReportErrorMessage(error)),
      },
    );
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (featureOff) {
    content = <EmptyState icon="lock-closed-outline" title="Learning plans are not open yet" description="Nothing was changed and no credit was used." />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error || !list.data) {
    content = <ErrorState message={careerErrorMessage(list.error ?? access.error, 'Could not load your learning plans.')} onRetry={() => void list.refetch()} />;
  } else {
    const reports = list.data.items;
    const credits = creditsLeft(list.data.skillReport);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-500 text-sm mb-4 leading-5">
          Bridge the gap to a target role with milestones, curated resources and an optional practical project. Built from your confirmed facts.
        </Text>
        <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4 flex-row items-center">
          <View className="flex-1 mr-3">
            <Text className="text-stone-500 text-xs font-semibold uppercase tracking-wide">Skill report credits</Text>
            <Text className="text-2xl font-black text-stone-900 mt-0.5">{credits ?? '—'}</Text>
          </View>
          <Button
            onPress={() => {
              setCreateError(null);
              setOpen(true);
            }}
            icon={<Ionicons name="add" size={18} color={colors.white} />}
          >
            New plan
          </Button>
        </View>
        {reports.length === 0 ? (
          <EmptyState icon="school-outline" title="No learning plans yet" description="Set a target role to see your skill gaps and a milestone plan." />
        ) : (
          <>
            <Text className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">Your learning plans</Text>
            {reports.map((report) => (
              <TouchableOpacity
                key={report.id}
                onPress={() => router.push(`/(dashboard)/career/learning/${report.id}` as Href)}
                className="bg-white border border-stone-100 rounded-2xl p-4 mb-3 flex-row items-center min-h-[56px]"
                accessibilityRole="button"
                accessibilityLabel={`${report.targetRole}, ${report.progress.percent} percent complete`}
                activeOpacity={0.8}
              >
                <View className="flex-1 mr-2">
                  <View className="flex-row items-center justify-between">
                    <Text className="font-bold text-stone-900 flex-1 mr-2" numberOfLines={1}>
                      {report.targetRole}
                    </Text>
                    <Pill label={`${report.progress.percent}%`} tone={report.progress.percent === 100 ? 'success' : 'brand'} />
                  </View>
                  <Text className="text-stone-500 text-xs mt-1" numberOfLines={1}>
                    {reportMeta(report)}
                  </Text>
                  <View className="h-1.5 bg-stone-100 rounded-full mt-2 overflow-hidden">
                    <View className="h-1.5 bg-brand-500 rounded-full" style={{ width: `${report.progress.percent}%` }} />
                  </View>
                  <Text className="text-stone-400 text-xs mt-1.5">{formatDay(report.createdAt) ?? ''}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.stone[300]} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Learning plans" subtitle="Skill gaps and milestones" />
      {content}
      <Modal visible={open} onClose={() => setOpen(false)} title="Target a new role" size="full" closeDisabled={create.isPending}>
        <Text className="text-stone-500 text-sm leading-5 mb-4">
          Uses 1 skill report credit. Includes the gap matrix, milestones and, if you choose, a practical project brief with rubrics at no extra charge.
        </Text>
        <Input
          label="Target role *"
          value={form.targetRole}
          onChangeText={(targetRole) => set({ targetRole })}
          placeholder="e.g. Senior Data Analyst"
          maxLength={200}
          error={fieldError?.field === 'targetRole' ? fieldError.message : undefined}
          editable={!create.isPending}
        />
        <Input
          label="Target industry (optional)"
          value={form.targetIndustry}
          onChangeText={(targetIndustry) => set({ targetIndustry })}
          placeholder="e.g. Healthcare"
          maxLength={200}
          editable={!create.isPending}
        />
        <Text className="text-sm font-medium text-stone-700 mb-1.5">Weekly time</Text>
        <View className="flex-row items-center mb-4">
          <StepButton
            icon="remove"
            label="Fewer hours per week"
            disabled={create.isPending || form.timeBudgetHoursPerWeek <= TIME_BUDGET_MIN}
            onPress={() => set({ timeBudgetHoursPerWeek: clampTimeBudget(form.timeBudgetHoursPerWeek - 1) })}
          />
          <Text className="flex-1 text-center text-base font-semibold text-stone-900" accessibilityLiveRegion="polite">
            {`${form.timeBudgetHoursPerWeek} hours/week`}
          </Text>
          <StepButton
            icon="add"
            label="More hours per week"
            disabled={create.isPending || form.timeBudgetHoursPerWeek >= TIME_BUDGET_MAX}
            onPress={() => set({ timeBudgetHoursPerWeek: clampTimeBudget(form.timeBudgetHoursPerWeek + 1) })}
          />
        </View>
        <Input
          label="Learning budget in dollars"
          value={form.financialBudget}
          onChangeText={(financialBudget) => set({ financialBudget: financialBudget.replace(/[^0-9]/g, '') })}
          keyboardType="number-pad"
          maxLength={7}
          hint="Your own budget for courses. 0 means free resources only."
          error={fieldError?.field === 'financialBudget' ? fieldError.message : undefined}
          editable={!create.isPending}
        />
        <View className="flex-row items-center justify-between mb-4 min-h-[44px]">
          <Text className="flex-1 text-sm text-stone-700 mr-3">Include a practical project brief with evaluation rubrics</Text>
          <Switch
            value={form.includeProjectBrief}
            onValueChange={(includeProjectBrief) => set({ includeProjectBrief })}
            disabled={create.isPending}
            trackColor={{ true: colors.brand[500], false: colors.stone[300] }}
            accessibilityLabel="Include a practical project brief"
          />
        </View>
        {createError ? (
          <View className="bg-error-bg rounded-xl p-3 mb-3" accessibilityLiveRegion="polite">
            <Text className="text-red-700 text-sm">{createError}</Text>
          </View>
        ) : null}
        <View className="flex-row gap-3 mb-8">
          <View className="flex-1">
            <Button variant="outline" fullWidth onPress={() => setOpen(false)} disabled={create.isPending}>
              Cancel
            </Button>
          </View>
          <View className="flex-1">
            <Button fullWidth onPress={onCreate} loading={create.isPending} disabled={form.targetRole.trim() === ''}>
              Create plan
            </Button>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function StepButton({ icon, label, disabled, onPress }: { icon: 'add' | 'remove'; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className={`h-11 w-11 rounded-xl border border-stone-200 bg-white items-center justify-center ${disabled ? 'opacity-40' : ''}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={20} color={colors.stone[700]} />
    </TouchableOpacity>
  );
}
