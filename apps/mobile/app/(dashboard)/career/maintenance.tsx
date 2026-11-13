import { ApiError } from '../../../../../packages/career-api-client/src/client';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { Button } from '../../../src/components/ui/Button';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Input } from '../../../src/components/ui/Input';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useMaintenance, useMaintenanceActions } from '../../../src/hooks/career/maintenance';
import { useCareerAccess } from '../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../src/hooks/useLeaveGuard';
import { checkCredential, checkTitle, dueCredentials, formatExpiry, maintenanceErrorMessage } from '../../../src/lib/career/maintenance';
import { careerErrorMessage } from '../../../src/lib/career-view';
import { colors } from '../../../src/theme/colors';
import { useT } from '../../../src/i18n';

type Section = 'achievement' | 'goal' | 'credential';

/**
 * Career maintenance, as on the website (career/maintenance): log
 * achievements and promotion goals, and keep credential expiry dates so the
 * ones due within 90 days stand out. All free. A promotion goal is not a
 * confirmed fact. The API has no edit or delete for these entries.
 */
export default function CareerMaintenanceScreen() {
  const t = useT('careerPlans');
  const access = useCareerAccess();
  const view = useMaintenance();
  const actions = useMaintenanceActions();
  const [achievement, setAchievement] = useState('');
  const [goal, setGoal] = useState('');
  const [credentialName, setCredentialName] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Section | 'expiresOn', string>>>({});
  const [saved, setSaved] = useState<Section | null>(null);
  const busy = actions.addAchievement.isPending || actions.addPromotionGoal.isPending || actions.addCredential.isPending;

  useLeaveGuard(achievement.trim() !== '' || goal.trim() !== '' || credentialName.trim() !== '' || expiresOn.trim() !== '');

  const fail = (section: Section) => (error: unknown) => {
    const field = error instanceof ApiError && error.body.field === 'expiresOn' ? 'expiresOn' : section;
    setErrors((e) => ({ ...e, [field]: maintenanceErrorMessage(error) }));
  };

  const onAchievement = () => {
    const check = checkTitle(achievement, 'achievement');
    setSaved(null);
    if (!check.ok) return setErrors((e) => ({ ...e, achievement: check.message }));
    actions.addAchievement.mutate(check.value, {
      onSuccess: () => {
        setAchievement('');
        setSaved('achievement');
      },
      onError: fail('achievement'),
    });
  };

  const onGoal = () => {
    const check = checkTitle(goal, 'promotion goal');
    setSaved(null);
    if (!check.ok) return setErrors((e) => ({ ...e, goal: check.message }));
    actions.addPromotionGoal.mutate(check.value, {
      onSuccess: () => {
        setGoal('');
        setSaved('goal');
      },
      onError: fail('goal'),
    });
  };

  const onCredential = () => {
    const check = checkCredential(credentialName, expiresOn);
    setSaved(null);
    if (!check.ok) return setErrors((e) => ({ ...e, [check.field === 'name' ? 'credential' : 'expiresOn']: check.message }));
    actions.addCredential.mutate(
      { name: check.name, expiresOn: check.expiresOn },
      {
        onSuccess: () => {
          setCredentialName('');
          setExpiresOn('');
          setSaved('credential');
        },
        onError: fail('credential'),
      },
    );
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('lockedTitle')} />;
  } else if (access.isLoading || view.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (view.error instanceof ApiError && view.error.code === 'feature_unavailable') {
    content = <EmptyState icon="lock-closed-outline" title={t('maintenance.notOpen')} description={t('maintenance.nothingChanged')} />;
  } else if (access.error || view.error || !view.data) {
    content = <ErrorState message={careerErrorMessage(view.error ?? access.error, t('maintenance.loadError'))} onRetry={() => void view.refetch()} />;
  } else {
    const data = view.data;
    const due = dueCredentials(data);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={view.isRefetching} onRefresh={() => void view.refetch()} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-500 text-sm mb-4 leading-5">
          {t('maintenance.intro')}
        </Text>

        {due.length > 0 ? (
          <View className="bg-warning-bg rounded-2xl p-4 mb-4" accessibilityLiveRegion="polite">
            <Text className="text-warning font-bold mb-1">{t('maintenance.dueTitle')}</Text>
            {due.map((c) => (
              <Text key={c.id} className="text-warning text-sm">{`${c.name} — ${formatExpiry(c.expiresOn)}`}</Text>
            ))}
          </View>
        ) : null}

        <Card title={t('maintenance.achievements')}>
          {data.achievements.length === 0 ? <Muted>{t('maintenance.noAchievements')}</Muted> : data.achievements.map((a) => <Row key={a.id} text={a.title} />)}
          <Input
            label={t('maintenance.newAchievement')}
            value={achievement}
            onChangeText={(text) => {
              setAchievement(text);
              setErrors((e) => ({ ...e, achievement: undefined }));
            }}
            placeholder={t('maintenance.achievementPlaceholder')}
            maxLength={200}
            error={errors.achievement}
            editable={!busy}
          />
          <Button variant="outline" onPress={onAchievement} loading={actions.addAchievement.isPending} disabled={busy || achievement.trim() === ''}>
            {t('maintenance.addAchievement')}
          </Button>
          {saved === 'achievement' ? <Saved text={t('maintenance.achievementSaved')} /> : null}
        </Card>

        <Card title={t('maintenance.goals')}>
          {data.promotionGoals.length === 0 ? <Muted>{t('maintenance.noGoals')}</Muted> : data.promotionGoals.map((g) => <Row key={g.id} text={g.desiredTitle} />)}
          <Input
            label={t('maintenance.goal')}
            value={goal}
            onChangeText={(text) => {
              setGoal(text);
              setErrors((e) => ({ ...e, goal: undefined }));
            }}
            placeholder={t('maintenance.goalPlaceholder')}
            maxLength={200}
            error={errors.goal}
            editable={!busy}
          />
          <Button variant="outline" onPress={onGoal} loading={actions.addPromotionGoal.isPending} disabled={busy || goal.trim() === ''}>
            {t('maintenance.saveGoal')}
          </Button>
          {saved === 'goal' ? <Saved text={t('maintenance.goalSaved')} /> : null}
        </Card>

        <Card title={t('maintenance.credentials')}>
          {data.credentials.length === 0 ? (
            <Muted>{t('maintenance.noCredentials')}</Muted>
          ) : (
            data.credentials.map((c) => (
              <View key={c.id} className="flex-row items-center py-2 border-b border-stone-100">
                <View className="flex-1 me-2">
                  <Text className="text-sm text-stone-900 font-medium">{c.name}</Text>
                  <Text className="text-xs text-stone-500 mt-0.5">{t('maintenance.expires', { date: formatExpiry(c.expiresOn) })}</Text>
                </View>
                {c.due ? <Pill label={t('maintenance.dueSoon')} tone="warning" /> : null}
              </View>
            ))
          )}
          <View className="h-3" />
          <Input
            label={t('maintenance.credential')}
            value={credentialName}
            onChangeText={(text) => {
              setCredentialName(text);
              setErrors((e) => ({ ...e, credential: undefined }));
            }}
            placeholder={t('maintenance.credentialPlaceholder')}
            maxLength={200}
            error={errors.credential}
            editable={!busy}
          />
          <Input
            label={t('maintenance.expiresOn')}
            value={expiresOn}
            onChangeText={(text) => {
              setExpiresOn(text.replace(/[^0-9-]/g, ''));
              setErrors((e) => ({ ...e, expiresOn: undefined }));
            }}
            placeholder={t('maintenance.datePlaceholder')}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={10}
            hint={t('maintenance.dateHint')}
            error={errors.expiresOn}
            editable={!busy}
          />
          <Button variant="outline" onPress={onCredential} loading={actions.addCredential.isPending} disabled={busy || credentialName.trim() === '' || expiresOn.trim() === ''}>
            {t('maintenance.saveCredential')}
          </Button>
          {saved === 'credential' ? <Saved text={t('maintenance.credentialSaved')} /> : null}
        </Card>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('maintenance.title')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
      <Text className="text-base font-bold text-stone-900 mb-2" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ text }: { text: string }) {
  return (
    <View className="py-2 border-b border-stone-100">
      <Text className="text-sm text-stone-900">{text}</Text>
    </View>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <Text className="text-stone-400 text-sm mb-3">{children}</Text>;
}

function Saved({ text }: { text: string }) {
  return (
    <Text className="text-success text-sm mt-2" accessibilityLiveRegion="polite">
      {text}
    </Text>
  );
}
