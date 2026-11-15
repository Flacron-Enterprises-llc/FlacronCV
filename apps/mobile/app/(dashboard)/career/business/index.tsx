import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BusinessMemberships } from '../../../../../../packages/career-api-client/src/types';
import { CandidatesSection } from '../../../../src/components/career/business/CandidatesSection';
import { MyMemberships } from '../../../../src/components/career/business/MyMemberships';
import { ChipPicker, NoteView, Section, Tag } from '../../../../src/components/career/business/parts';
import { QueueSection } from '../../../../src/components/career/business/QueueSection';
import { StaffSection } from '../../../../src/components/career/business/StaffSection';
import { ReportSection, UsageSection } from '../../../../src/components/career/business/TotalsSections';
import { CareerHeader } from '../../../../src/components/career/CareerHeader';
import { FeatureState, PlanCard, StateCard } from '../../../../src/components/career/FeatureState';
import { Button } from '../../../../src/components/ui/Button';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useBusinessMemberships, useBusinessOverview } from '../../../../src/hooks/career/business';
import { useT } from '../../../../src/i18n';
import { hasNoBusinessRole, roleLabel, roleScope, scopeErrorMessage, seatsLine, workspaceChoices } from '../../../../src/lib/career/business';
import { colors } from '../../../../src/theme/colors';

/**
 * Business workspace (website: /career/business, BusinessPanel). One screen
 * for every role; each section appears only when the role's scope (from the
 * API) includes it, and the API enforces it. People outside the Business plan
 * still use it when they are staff of another workspace or an invited
 * candidate; anyone else sees "not in your plan" (no purchase in the app).
 */
export default function BusinessScreen() {
  const t = useT('careerBusiness');
  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('scope.businessTitle')} subtitle={t('scope.businessMetaDescription')} />
      <FeatureState href="/career/business" ignorePlan>
        <BusinessBody />
      </FeatureState>
    </SafeAreaView>
  );
}

function BusinessBody() {
  const t = useT('careerBusiness');
  const router = useRouter();
  const memberships = useBusinessMemberships();
  const openJoin = () => router.push('/(dashboard)/career/business/join' as Href);

  if (memberships.isLoading) {
    return (
      <View className="p-5" accessibilityLabel={t('scope.loading')}>
        <SkeletonCard />
      </View>
    );
  }
  if (memberships.error) {
    const code = (memberships.error as { code?: string }).code;
    if (code === 'feature_unavailable') return <StateCard icon="time-outline" badge={t('scope.comingSoon')} title={t('scope.offTitle')} body={t('scope.offBody')} />;
    if (code === 'permission_denied') return <StateCard icon="lock-closed-outline" title={t('scope.permissionTitle')} body={t('scope.permissionBody')} />;
    return <ErrorState message={scopeErrorMessage(memberships.error)} onRetry={() => void memberships.refetch()} />;
  }
  const data = memberships.data as BusinessMemberships;
  if (hasNoBusinessRole(data)) {
    return (
      <PlanCard title={t('scope.businessPlanTitle')} body={t('scope.businessPlanBody')}>
        <View className="mt-3 self-start">
          <Button variant="outline" size="sm" onPress={openJoin}>
            {t('mobile.joinOpen')}
          </Button>
        </View>
      </PlanCard>
    );
  }
  return <Workspaces memberships={data} onJoin={openJoin} refreshing={memberships.isRefetching} onRefresh={() => void memberships.refetch()} />;
}

function Workspaces({
  memberships,
  onJoin,
  refreshing,
  onRefresh,
}: {
  memberships: BusinessMemberships;
  onJoin: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useT('careerBusiness');
  const choices = workspaceChoices(memberships);
  const [picked, setPicked] = useState<string>(choices[0]?.workspaceId ?? '');
  const choice = choices.find((item) => item.workspaceId === picked) ?? choices[0];
  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[600]} />}
    >
      {choices.length > 1 ? (
        <Section title={t('scope.workspaceChoose')}>
          <View className="mt-2">
            <ChipPicker
              label={t('scope.workspaceChoose')}
              value={choice?.workspaceId ?? ''}
              options={choices.map((item) => ({ value: item.workspaceId, label: item.label }))}
              onChange={(value) => value && setPicked(value)}
            />
          </View>
        </Section>
      ) : null}
      {choice ? <WorkspaceView key={choice.workspaceId} workspace={choice.acting} /> : null}
      {memberships.candidateOf.length > 0 ? <MyMemberships items={memberships.candidateOf} /> : null}
      <Button variant="ghost" onPress={onJoin}>
        {t('mobile.joinOpen')}
      </Button>
    </ScrollView>
  );
}

function WorkspaceView({ workspace }: { workspace: string | undefined }) {
  const t = useT('careerBusiness');
  const overview = useBusinessOverview(workspace);
  if (overview.isLoading) return <Text className="text-stone-500 text-sm mb-4">{t('scope.loading')}</Text>;
  if (overview.error || !overview.data) {
    return (
      <View className="mb-4">
        <NoteView note={{ tone: 'error', text: scopeErrorMessage(overview.error) }} />
        <View className="mt-2 self-start">
          <Button variant="outline" size="sm" onPress={() => void overview.refetch()}>
            {t('scope.retry')}
          </Button>
        </View>
      </View>
    );
  }
  const view = overview.data;
  const { scope } = view;
  return (
    <>
      <Section title={t('scope.yourRole')}>
        <View className="mt-2 self-start">
          <Tag label={roleLabel(view.role)} />
        </View>
        <Text className="text-stone-600 text-sm mt-2 leading-5">{roleScope(view.role)}</Text>
        <Text className="text-stone-500 text-sm mt-2 leading-5">{seatsLine(view)}</Text>
      </Section>
      {scope.candidates !== 'none' ? <CandidatesSection view={view} workspace={workspace} /> : null}
      {scope.manageWorkspace ? <StaffSection view={view} workspace={workspace} /> : null}
      {scope.queue ? <QueueSection view={view} workspace={workspace} /> : null}
      {scope.billing || scope.manageWorkspace ? <UsageSection workspace={workspace} /> : null}
      {scope.reports ? <ReportSection workspace={workspace} /> : null}
    </>
  );
}
