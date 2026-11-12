import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ScenarioResult } from '../../../../../packages/career-api-client/src/types';
import { CareerHeader } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Input } from '../../../src/components/ui/Input';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useCreateScenario } from '../../../src/hooks/career/scenarios';
import { useCareerAccess, useCareerUsage } from '../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../src/hooks/useLeaveGuard';
import { keyForAction, type KeyedAction } from '../../../src/lib/career/action-packs';
import {
  addRoute,
  buildScenarioOptions,
  FIRST_ROUTE,
  MAX_ROUTES,
  payLabel,
  removeRoute,
  scenarioErrorMessage,
  scenarioSignature,
  updateRoute,
  type RouteDraft,
} from '../../../src/lib/career/scenarios';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { careerErrorMessage } from '../../../src/lib/career-view';
import { colors } from '../../../src/theme/colors';

/**
 * Scenario planner, as on the website (career/scenarios): compare up to three
 * routes by name, destination and the pay you enter. Missing pay stays
 * unknown; the result is not a promise of earnings or employment. One
 * scenario-report credit per comparison.
 */
export default function ScenariosScreen() {
  const access = useCareerAccess();
  const usage = useCareerUsage();
  const create = useCreateScenario();
  const [routes, setRoutes] = useState<RouteDraft[]>([{ ...FIRST_ROUTE }]);
  const [formError, setFormError] = useState<{ index: number | null; message: string } | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const action = useRef<KeyedAction | null>(null);

  const edited = routes.length > 1 || routes[0].name !== FIRST_ROUTE.name || routes[0].destination !== FIRST_ROUTE.destination || routes[0].wage !== '';
  useLeaveGuard(edited && result === null);

  const credits = usage.data?.units.find((u) => u.unit === 'scenario_report');
  const featureOff = access.data?.enabled === true && access.data.features?.scenarioReports === false;

  const change = (next: RouteDraft[]) => {
    setRoutes(next);
    setFormError(null);
  };

  const onCompare = () => {
    if (create.isPending) return;
    const built = buildScenarioOptions(routes);
    if (!built.ok) {
      setFormError({ index: built.index, message: built.message });
      return;
    }
    // A retry of the same comparison reuses the key, so it is never charged twice.
    action.current = keyForAction(action.current, scenarioSignature(built.options), () => Crypto.randomUUID());
    setFormError(null);
    setResult(null);
    create.mutate(
      { options: built.options, idempotencyKey: action.current.key },
      {
        onSuccess: (paid) => {
          action.current = null;
          setResult(paid.result);
        },
        onError: (error) => setFormError({ index: null, message: scenarioErrorMessage(error) }),
      },
    );
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (featureOff) {
    content = <EmptyState icon="lock-closed-outline" title="The scenario planner is not open yet" description="Nothing was changed and no credit was used." />;
  } else if (access.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
      </View>
    );
  } else if (access.error) {
    content = <ErrorState message={careerErrorMessage(access.error, 'Could not load the scenario planner.')} onRetry={() => void access.refetch()} />;
  } else {
    content = (
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text className="text-stone-500 text-sm mb-4 leading-5">
          Compare up to three routes. Missing pay stays unknown. The comparison is not a promise of earnings or employment.
        </Text>
        {routes.map((route, index) => (
          <View
            key={index}
            className={`bg-white border rounded-2xl p-4 mb-3 ${formError?.index === index ? 'border-red-300' : 'border-stone-100'}`}
          >
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-base font-bold text-stone-900" accessibilityRole="header">{`Route ${index + 1}`}</Text>
              {routes.length > 1 ? (
                <TouchableOpacity
                  onPress={() => change(removeRoute(routes, index))}
                  disabled={create.isPending}
                  className="h-11 w-11 items-center justify-center -mr-2"
                  accessibilityRole="button"
                  accessibilityLabel={`Remove route ${index + 1}`}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.stone[500]} />
                </TouchableOpacity>
              ) : null}
            </View>
            <Input
              label="Route name"
              value={route.name}
              onChangeText={(name) => change(updateRoute(routes, index, { name }))}
              maxLength={120}
              editable={!create.isPending}
            />
            <Input
              label="Destination"
              value={route.destination}
              onChangeText={(destination) => change(updateRoute(routes, index, { destination }))}
              maxLength={120}
              editable={!create.isPending}
            />
            <Input
              label="Pay in cents"
              value={route.wage}
              onChangeText={(wage) => change(updateRoute(routes, index, { wage: wage.replace(/[^0-9]/g, '') }))}
              keyboardType="number-pad"
              maxLength={12}
              hint="Leave this blank when the pay is unknown."
              editable={!create.isPending}
            />
          </View>
        ))}
        <Button
          variant="outline"
          onPress={() => change(addRoute(routes))}
          disabled={create.isPending || routes.length >= MAX_ROUTES}
          icon={<Ionicons name="add" size={18} color={colors.stone[700]} />}
        >
          {routes.length >= MAX_ROUTES ? 'Up to three routes' : 'Add a route'}
        </Button>
        {formError ? (
          <View className="bg-error-bg rounded-xl p-3 mt-4" accessibilityLiveRegion="polite">
            <Text className="text-red-700 text-sm">{formError.message}</Text>
          </View>
        ) : null}
        <Text className="text-stone-500 text-xs mt-4 mb-2">
          {`Uses 1 scenario report credit.${credits ? ` Credits left: ${credits.includedRemaining + credits.packRemaining}.` : ''}`}
        </Text>
        <Button fullWidth onPress={onCompare} loading={create.isPending}>
          Compare
        </Button>

        {result ? (
          <View className="bg-white border border-stone-100 rounded-2xl p-4 mt-5" accessibilityLiveRegion="polite">
            <Text className="text-base font-bold text-stone-900 mb-1">Comparison</Text>
            <Text className="text-stone-600 text-sm leading-5 mb-3">{result.tradeoff}</Text>
            {result.options.map((option, i) => (
              <View key={`${option.name}-${i}`} className="border-t border-stone-100 py-3">
                <Text className="text-sm font-semibold text-stone-900">{option.name}</Text>
                <Text className="text-xs text-stone-500 mt-0.5">{option.destination}</Text>
                <Text className={`text-xs mt-1 ${option.wageCents === null ? 'text-warning' : 'text-stone-700'}`}>{payLabel(option)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Scenario planner" subtitle="Compare up to three routes" />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
