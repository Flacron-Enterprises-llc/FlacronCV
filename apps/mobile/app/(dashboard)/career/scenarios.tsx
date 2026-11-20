import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import React, { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ScenarioResult } from '../../../../../packages/career-api-client/src/types';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { Choice, Note } from '../../../src/components/career/plans/PlanBits';
import { Button } from '../../../src/components/ui/Button';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Input } from '../../../src/components/ui/Input';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useCareerModeLocations } from '../../../src/hooks/career/modes';
import { useCreateScenario, useDeleteScenario, useScenarios, useScenarioSkillReports, useUpdateScenario } from '../../../src/hooks/career/scenarios';
import { useCareerAccess } from '../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../src/hooks/useLeaveGuard';
import { keyForAction, type KeyedAction } from '../../../src/lib/career/action-packs';
import {
  addRoute,
  amountLabel,
  BLANK_ROUTE,
  buildScenarioOptions,
  confirmBody,
  MAX_ROUTES,
  monthsLabel,
  removeRoute,
  resultToDrafts,
  SCENARIO_NOTE_MAX,
  SCENARIO_TEXT_MAX,
  savedScenarioErrorMessage,
  scenarioErrorMessage,
  scenarioSignature,
  SOURCES,
  sourceLabel,
  UNCERTAINTIES,
  uncertaintyLabel,
  updateRoute,
  wageLabelText,
  type RouteDraft,
} from '../../../src/lib/career/scenarios';
import { careerErrorMessage, formatDay } from '../../../src/lib/career-view';
import { colors } from '../../../src/theme/colors';
import { useT } from '../../../src/i18n';

const numberPad = { keyboardType: 'decimal-pad' as const, maxLength: 15 };
const dateProps = {
  keyboardType: Platform.OS === 'ios' ? ('numbers-and-punctuation' as const) : ('default' as const),
  autoCapitalize: 'none' as const,
  autoCorrect: false,
  maxLength: 10,
};

/**
 * Scenario planner, as on the website (career/scenarios): compare up to three
 * routes with pay, cost and months (blank stays unknown), where the figures
 * come from and how sure they are, known requirements, and optional links to
 * a location profile and a skill report. A new comparison uses one scenario
 * report after a confirmation that shows the balance; saved comparisons can
 * be reopened, edited (recomputed, free) and deleted. Nothing here is a
 * promise of earnings or employment.
 */
export default function ScenariosScreen() {
  const t = useT('careerPlans');
  const ts = useT('careerPlans.scope');
  const tc = useT('common');
  const access = useCareerAccess();
  const list = useScenarios();
  const places = useCareerModeLocations();
  const reports = useScenarioSkillReports();
  const create = useCreateScenario();
  const update = useUpdateScenario();
  const remove = useDeleteScenario();
  const [routes, setRoutes] = useState<RouteDraft[]>([{ ...BLANK_ROUTE }]);
  const [title, setTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<{ index: number | null; message: string } | null>(null);
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [dirty, setDirty] = useState(false);
  const action = useRef<KeyedAction | null>(null);
  const scroll = useRef<ScrollView>(null);

  useLeaveGuard(dirty);

  const remaining = list.data?.remaining ?? null;
  const featureOff = access.data?.enabled === true && access.data.features?.scenarioReports === false;
  const busy = create.isPending || update.isPending || remove.isPending;

  const change = (next: RouteDraft[]) => {
    setRoutes(next);
    setFormError(null);
    setDirty(true);
  };

  const startNew = () => {
    setEditingId(null);
    setTitle('');
    setRoutes([{ ...BLANK_ROUTE }]);
    setResult(null);
    setFormError(null);
    setNote(null);
    setDirty(false);
  };

  const reopen = (item: ScenarioResult) => {
    setEditingId(item.id);
    setTitle(item.title);
    setRoutes(resultToDrafts(item));
    setResult(item);
    setFormError(null);
    setNote(null);
    setDirty(false);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const run = (options: Parameters<typeof scenarioSignature>[0]) => {
    // A retry of the same comparison reuses the key, so it is never charged twice.
    action.current = keyForAction(action.current, scenarioSignature(options, title), () => Crypto.randomUUID());
    create.mutate(
      { options, idempotencyKey: action.current.key, title: title.trim() || undefined },
      {
        onSuccess: (paid) => {
          action.current = null;
          setResult(paid.result);
          setEditingId(paid.result.id);
          setDirty(false);
        },
        onError: (error) => setFormError({ index: null, message: scenarioErrorMessage(error) }),
      },
    );
  };

  const onCompare = () => {
    if (busy) return;
    setNote(null);
    const built = buildScenarioOptions(routes);
    if (!built.ok) {
      setFormError({ index: built.index, message: built.message });
      return;
    }
    setFormError(null);
    // Spec section 21: the charge and the balance are confirmed before the paid run.
    Alert.alert(ts('scenario_confirm_title'), confirmBody(remaining), [
      { text: tc('cancel'), style: 'cancel' },
      { text: ts('scenario_confirm_go'), onPress: () => run(built.options) },
    ]);
  };

  const onSaveEdits = () => {
    if (!editingId || busy) return;
    setNote(null);
    const built = buildScenarioOptions(routes);
    if (!built.ok) {
      setFormError({ index: built.index, message: built.message });
      return;
    }
    setFormError(null);
    update.mutate(
      { id: editingId, patch: { options: built.options, title: title.trim() || undefined } },
      {
        onSuccess: (updated) => {
          setResult(updated);
          setDirty(false);
          setNote({ tone: 'success', text: ts('scenario_updated') });
        },
        onError: (error) => setNote({ tone: 'error', text: savedScenarioErrorMessage(error) }),
      },
    );
  };

  const onDelete = (item: ScenarioResult) => {
    Alert.alert(t('scenarios.deleteTitle'), t('scenarios.deleteBody', { title: item.title }), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () =>
          remove.mutate(item.id, {
            onSuccess: () => {
              if (editingId === item.id) startNew();
              setNote({ tone: 'success', text: t('scenarios.deleted') });
            },
            onError: (error) => setNote({ tone: 'error', text: savedScenarioErrorMessage(error) }),
          }),
      },
    ]);
  };

  const placeOptions = [{ value: '', label: ts('scenario_no_link') }, ...(places.data?.items ?? []).map((p) => ({ value: p.id, label: p.place }))];
  const reportOptions = [{ value: '', label: ts('scenario_no_link') }, ...(reports.data?.items ?? []).map((r) => ({ value: r.id, label: r.targetRole }))];
  const sourceOptions = SOURCES.map((value) => ({ value, label: sourceLabel(value) }));
  const certaintyOptions = UNCERTAINTIES.map((value) => ({ value, label: uncertaintyLabel(value) }));

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('lockedTitle')} />;
  } else if (featureOff) {
    content = <EmptyState icon="lock-closed-outline" title={t('scenarios.notOpen')} description={t('nothingChangedNoCredit')} />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || list.error || !list.data) {
    content = <ErrorState message={careerErrorMessage(list.error ?? access.error, t('scenarios.loadError'))} onRetry={() => void list.refetch()} />;
  } else {
    const saved = list.data.items;
    content = (
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-500 text-sm mb-4 leading-5">{ts('scenario_help')}</Text>
        {note ? <Note tone={note.tone} text={note.text} /> : null}

        <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4">
          <Text className="text-base font-bold text-stone-900 mb-2" accessibilityRole="header">
            {ts('scenario_saved_heading')}
          </Text>
          {saved.length === 0 ? <Text className="text-stone-500 text-sm">{ts('scenario_saved_empty')}</Text> : null}
          {saved.map((item) => (
            <View key={item.id} className={`border-t border-stone-100 py-2 ${editingId === item.id ? 'bg-brand-50 -mx-2 px-2 rounded-lg' : ''}`}>
              <Text className="text-sm font-semibold text-stone-900">{item.title}</Text>
              <Text className="text-xs text-stone-500">{formatDay(item.createdAt) ?? ''}</Text>
              <View className="flex-row flex-wrap justify-end gap-2 mt-1">
                <Button size="sm" variant="outline" onPress={() => reopen(item)} disabled={busy} accessibilityLabel={`${ts('scenario_open')}: ${item.title}`}>
                  {ts('scenario_open')}
                </Button>
                <Button size="sm" variant="ghost" onPress={() => onDelete(item)} disabled={busy} accessibilityLabel={`${tc('delete')}: ${item.title}`}>
                  {tc('delete')}
                </Button>
              </View>
            </View>
          ))}
          {editingId ? (
            <View className="mt-2 self-start">
              <Button size="sm" variant="outline" onPress={startNew} disabled={busy} icon={<Ionicons name="add" size={16} color={colors.stone[700]} />}>
                {ts('scenario_new')}
              </Button>
            </View>
          ) : null}
        </View>

        {editingId ? <Pill label={t('scenarios.editingSaved')} tone="brand" /> : null}
        <View className="mt-2">
          <Input
            label={ts('scenario_title')}
            value={title}
            onChangeText={(text) => {
              setTitle(text);
              setDirty(true);
            }}
            maxLength={SCENARIO_TEXT_MAX}
            editable={!busy}
          />
        </View>

        {routes.map((route, index) => {
          const set = (patch: Partial<RouteDraft>) => change(updateRoute(routes, index, patch));
          return (
            <View key={index} className={`bg-surface border rounded-2xl p-4 mb-3 ${formError?.index === index ? 'border-red-300' : 'border-stone-100'}`}>
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-base font-bold text-stone-900" accessibilityRole="header">
                  {ts('route_n', { n: index + 1 })}
                </Text>
                {routes.length > 1 ? (
                  <TouchableOpacity
                    onPress={() => change(removeRoute(routes, index))}
                    disabled={busy}
                    className="h-11 w-11 items-center justify-center -me-2"
                    accessibilityRole="button"
                    accessibilityLabel={t('scenarios.removeRoute', { number: index + 1 })}
                  >
                    <Ionicons name="trash-outline" size={20} color={colors.stone[500]} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <Input label={ts('option_name')} placeholder={ts('option_name_placeholder')} value={route.name} onChangeText={(name) => set({ name })} maxLength={SCENARIO_TEXT_MAX} editable={!busy} />
              <Input label={ts('destination')} placeholder={ts('destination_placeholder')} value={route.destination} onChangeText={(destination) => set({ destination })} maxLength={SCENARIO_TEXT_MAX} editable={!busy} />
              <Input label={ts('pay')} placeholder={ts('pay_placeholder')} hint={ts('wage_help')} value={route.pay} onChangeText={(pay) => set({ pay })} {...numberPad} editable={!busy} />
              <Input label={ts('scenario_cost')} value={route.cost} onChangeText={(cost) => set({ cost })} {...numberPad} editable={!busy} />
              <Input label={ts('scenario_months')} value={route.months} onChangeText={(months) => set({ months: months.replace(/[^0-9]/g, '') })} keyboardType="number-pad" maxLength={4} editable={!busy} />
              <Choice label={ts('scenario_source')} value={route.source} options={sourceOptions} onChange={(source) => set({ source: source as RouteDraft['source'] })} disabled={busy} />
              <Input label={ts('scenario_source_name')} hint={ts('scenario_source_name_hint')} value={route.sourceName} onChangeText={(sourceName) => set({ sourceName })} maxLength={SCENARIO_TEXT_MAX} editable={!busy} />
              <Input
                label={ts('scenario_source_date')}
                placeholder={t('maintenance.datePlaceholder')}
                value={route.sourceDate}
                onChangeText={(text) => set({ sourceDate: text.replace(/[^0-9-]/g, '') })}
                {...dateProps}
                editable={!busy}
              />
              <Choice label={ts('scenario_uncertainty')} value={route.uncertainty} options={certaintyOptions} onChange={(level) => set({ uncertainty: level as RouteDraft['uncertainty'] })} disabled={busy} />
              <Input
                label={ts('scenario_requirements')}
                hint={ts('scenario_requirements_hint')}
                value={route.requirements}
                onChangeText={(requirements) => set({ requirements })}
                maxLength={SCENARIO_NOTE_MAX}
                multiline
                textAlignVertical="top"
                style={{ minHeight: 60 }}
                editable={!busy}
              />
              <Choice label={ts('scenario_location')} value={route.locationProfileId} options={placeOptions} onChange={(locationProfileId) => set({ locationProfileId })} disabled={busy} />
              <Choice label={ts('scenario_skill_report')} value={route.skillReportId} options={reportOptions} onChange={(skillReportId) => set({ skillReportId })} disabled={busy} />
            </View>
          );
        })}
        <Button
          variant="outline"
          onPress={() => change(addRoute(routes))}
          disabled={busy || routes.length >= MAX_ROUTES}
          icon={<Ionicons name="add" size={18} color={colors.stone[700]} />}
        >
          {routes.length >= MAX_ROUTES ? t('scenarios.maxRoutes') : ts('add_route')}
        </Button>
        {formError ? (
          <View className="bg-error-bg rounded-xl p-3 mt-4" accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Text className="text-red-700 text-sm">{formError.message}</Text>
          </View>
        ) : null}
        <View className="mt-4">
          {editingId ? (
            <>
              <Text className="text-stone-500 text-xs mb-2">{t('scenarios.editFree')}</Text>
              <Button fullWidth onPress={onSaveEdits} loading={update.isPending} disabled={busy}>
                {ts('scenario_save_edits')}
              </Button>
            </>
          ) : (
            <>
              <Text className="text-stone-500 text-xs mb-2">
                {[t('scenarios.cost'), remaining === null ? null : t('scenarios.creditsLeft', { count: remaining })].filter(Boolean).join(' ')}
              </Text>
              <Button fullWidth onPress={onCompare} loading={create.isPending} disabled={busy || remaining === 0}>
                {ts('compare')}
              </Button>
              {remaining === 0 ? <Text className="text-red-700 text-sm mt-2">{t('scenarios.errors.quota')}</Text> : null}
            </>
          )}
        </View>

        {result ? <ResultTable result={result} /> : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('scenarios.title')} subtitle={t('scenarios.subtitle')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The website's result table, one block per route (a six-column table does not fit a phone). */
function ResultTable({ result }: { result: ScenarioResult }) {
  const ts = useT('careerPlans.scope');
  return (
    <View className="bg-surface border border-stone-100 rounded-2xl p-4 mt-5" accessibilityLiveRegion="polite">
      <Text className="text-base font-bold text-stone-900 mb-1" accessibilityRole="header">
        {ts('scenario_result_title')}
      </Text>
      {result.options.map((option, i) => (
        <View key={`${option.name}-${i}`} className="border-t border-stone-100 py-3">
          <Text className="text-sm font-semibold text-stone-900">{option.name}</Text>
          {option.requirements ? <Text className="text-xs text-stone-500 mt-0.5">{option.requirements}</Text> : null}
          <Cell label={ts('destination')} value={option.destination} />
          <Cell label={ts('pay')} value={amountLabel(option.wageCents)} badge={wageLabelText(option.wageLabel)} />
          <Cell label={ts('scenario_cost')} value={amountLabel(option.costCents)} />
          <Cell label={ts('scenario_months')} value={monthsLabel(option.months)} />
          <Cell
            label={ts('scenario_source')}
            value={[sourceLabel(option.source), option.sourceName, option.sourceDate ? formatDay(`${option.sourceDate}T00:00:00Z`) : null].filter(Boolean).join(' · ')}
          />
          <Text className="text-xs text-stone-500 mt-1">{ts('uncertainty_is', { level: uncertaintyLabel(option.uncertainty) })}</Text>
        </View>
      ))}
      <Text className="text-stone-500 text-xs mt-2 leading-4">{ts('scenario_tradeoff')}</Text>
    </View>
  );
}

function Cell({ label, value, badge }: { label: string; value: string; badge?: string }) {
  return (
    <View className="flex-row items-start mt-1.5" accessible accessibilityLabel={`${label}: ${value}${badge ? ` (${badge})` : ''}`}>
      <Text className="text-xs text-stone-500 w-28 me-2">{label}</Text>
      <View className="flex-1">
        <Text className="text-sm text-stone-900">{value}</Text>
        {badge ? (
          <View className="mt-1">
            <Pill label={badge} />
          </View>
        ) : null}
      </View>
    </View>
  );
}
