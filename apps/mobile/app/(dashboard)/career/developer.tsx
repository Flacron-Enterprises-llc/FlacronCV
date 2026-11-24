import { HIDE_PLAN_CATALOG } from '../../../src/config/paid-upgrades';
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ApiKeyEnvironment, DeveloperStatus } from '../../../../../packages/career-api-client/src/types';
import { ChipPicker, NoteView, Section, shareText, Tag, type Note } from '../../../src/components/career/business/parts';
import { CareerHeader } from '../../../src/components/career/CareerHeader';
import { FeatureState, PlanCard, StateCard } from '../../../src/components/career/FeatureState';
import { Button } from '../../../src/components/ui/Button';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Input } from '../../../src/components/ui/Input';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useDeveloperActions, useDeveloperStatus } from '../../../src/hooks/career/developer';
import { useT } from '../../../src/i18n';
import { scopeErrorMessage } from '../../../src/lib/career/business';
import {
  attributionValid,
  developerMode,
  environmentLabel,
  keyCreatedLine,
  keyPrefixLabel,
  rateLimitsLine,
  sortKeys,
} from '../../../src/lib/career/developer';
import { colors } from '../../../src/theme/colors';

/**
 * Organization tools (website: /career/developer, DeveloperPanel): test and
 * live API keys (prefixes only; the secret is shown once) and the white-label
 * brand. Each action works only when its add-on is on the account; without
 * either add-on the page is an honest "coming soon". Nothing is sold here.
 */
export default function DeveloperScreen() {
  const t = useT('careerBusiness');
  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('scope.developerTitle')} subtitle={t('scope.developerMetaDescription')} />
      <FeatureState href="/career/developer">
        <DeveloperBody />
      </FeatureState>
    </SafeAreaView>
  );
}

function DeveloperBody() {
  const t = useT('careerBusiness');
  const status = useDeveloperStatus();
  if (status.isLoading) {
    return (
      <View className="p-5" accessibilityLabel={t('scope.loading')}>
        <SkeletonCard />
      </View>
    );
  }
  if (status.error || !status.data) {
    const code = (status.error as { code?: string } | null)?.code;
    if (code === 'plan_upgrade_required') return <PlanCard />;
    if (code === 'feature_unavailable') {
      return <StateCard icon="time-outline" badge={t('scope.comingSoon')} title={t('mobile.devSoonTitle')} body={`${t('scope.developerHelp')} ${t('mobile.soonBody')}`} />;
    }
    return <ErrorState message={scopeErrorMessage(status.error)} onRetry={() => void status.refetch()} />;
  }
  const mode = developerMode(status.data);
  if (mode.soon) {
    return (
      <StateCard
        icon="time-outline"
        badge={t('scope.comingSoon')}
        title={t('mobile.devSoonTitle')}
        body={`${t('scope.developerHelp')} ${t('scope.apiPackageMissing')} ${t('mobile.soonBody')}`}
      />
    );
  }
  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={status.isRefetching} onRefresh={() => void status.refetch()} tintColor={colors.brand[600]} />}
    >
      <KeysSection status={status.data} canCreate={mode.keys} />
      <BrandSection status={status.data} canSave={mode.brand} />
    </ScrollView>
  );
}

function KeysSection({ status, canCreate }: { status: DeveloperStatus; canCreate: boolean }) {
  const t = useT('careerBusiness');
  const actions = useDeveloperActions();
  const [environment, setEnvironment] = useState<ApiKeyEnvironment>('test');
  const [secret, setSecret] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const busy = actions.create.isPending || actions.revoke.isPending;
  const keys = sortKeys(status.keys ?? []);

  const create = () => {
    setNote(null);
    setSecret(null);
    actions.create.mutate(environment, {
      onSuccess: (created) => setSecret(created.token),
      onError: (error) => setNote({ tone: 'error', text: scopeErrorMessage(error, 'apiPackageMissing') }),
    });
  };

  const revoke = (keyId: string, label: string) => {
    Alert.alert(t('scope.revokeKey'), label, [
      { text: t('scope.cancel'), style: 'cancel' },
      {
        text: t('scope.revokeKey'),
        style: 'destructive',
        onPress: () => {
          setNote(null);
          actions.revoke.mutate(keyId, {
            onSuccess: () => setNote({ tone: 'success', text: t('scope.keyRevoked') }),
            onError: (error) => setNote({ tone: 'error', text: scopeErrorMessage(error) }),
          });
        },
      },
    ]);
  };

  return (
    <Section title={t('scope.apiHeading')} help={t('scope.developerHelp')}>
      {canCreate || HIDE_PLAN_CATALOG ? null : (
        <View className="mt-2 self-start">
          <Tag label={t('scope.comingSoon')} tone="muted" />
        </View>
      )}
      <Text className="text-stone-500 text-sm mt-2 leading-5">{rateLimitsLine(status)}</Text>
      <View className="mt-3">
        <ChipPicker
          label={t('scope.keyEnvironment')}
          value={environment}
          disabled={!canCreate}
          options={(['test', 'live'] as const).map((value) => ({ value, label: environmentLabel(value) }))}
          onChange={(value) => value && setEnvironment(value)}
        />
      </View>
      <View className="self-start">
        <Button onPress={create} loading={actions.create.isPending} disabled={busy || !canCreate}>
          {t('scope.createKey')}
        </Button>
      </View>
      {canCreate ? null : <Text className="text-stone-500 text-sm mt-3 leading-5">{t('scope.apiPackageMissing')}</Text>}
      <NoteView note={note} />
      {secret ? (
        <View className="rounded-xl border border-stone-200 bg-warning-bg p-3 mt-3" accessibilityLiveRegion="polite">
          <Text className="text-stone-900 text-sm font-semibold">{t('scope.keyOnce')}</Text>
          <Text selectable className="text-stone-900 text-xs mt-2" style={{ writingDirection: 'ltr', fontFamily: 'monospace' }}>
            {secret}
          </Text>
          <View className="flex-row flex-wrap gap-2 mt-2">
            <Button variant="outline" size="sm" onPress={() => void shareText(secret)}>
              {t('mobile.shareKey')}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => setSecret(null)}>
              {t('mobile.close')}
            </Button>
          </View>
        </View>
      ) : null}
      {keys.map((key) => {
        const label = `${keyPrefixLabel(key)} · ${environmentLabel(key.environment)}`;
        return (
          <View key={key.id} className="border border-stone-100 rounded-xl p-3 mt-3">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="text-stone-900 text-xs" style={{ writingDirection: 'ltr', fontFamily: 'monospace' }}>
                {keyPrefixLabel(key)}
              </Text>
              <Tag label={environmentLabel(key.environment)} tone="muted" />
              {key.revokedAt ? <Tag label={t('scope.keyRevokedBadge')} tone="muted" /> : null}
            </View>
            <Text className="text-stone-500 text-xs mt-1">{keyCreatedLine(key)}</Text>
            {key.revokedAt ? null : (
              <View className="mt-2 self-start">
                <Button variant="outline" size="sm" disabled={busy} accessibilityLabel={`${t('scope.revokeKey')}: ${label}`} onPress={() => revoke(key.id, label)}>
                  {t('scope.revokeKey')}
                </Button>
              </View>
            )}
          </View>
        );
      })}
    </Section>
  );
}

function BrandSection({ status, canSave }: { status: DeveloperStatus; canSave: boolean }) {
  const t = useT('careerBusiness');
  const actions = useDeveloperActions();
  const [brand, setBrand] = useState(status.brand?.brandName ?? '');
  const [attribution, setAttribution] = useState(status.brand?.attribution ?? '');
  const [note, setNote] = useState<Note | null>(null);

  const save = () => {
    setNote(null);
    if (!attributionValid(attribution)) return setNote({ tone: 'error', text: t('scope.attributionBody') });
    actions.brand.mutate(
      { brandName: brand.trim(), attribution: attribution.trim() },
      {
        onSuccess: (saved) => {
          setBrand(saved.brandName);
          setAttribution(saved.attribution);
          setNote({ tone: 'success', text: t('scope.brandSaved') });
        },
        onError: (error) => setNote({ tone: 'error', text: scopeErrorMessage(error, 'whiteLabelMissing') }),
      },
    );
  };

  return (
    <Section title={t('scope.brandHeading')}>
      {canSave || HIDE_PLAN_CATALOG ? null : (
        <View className="mt-2 self-start">
          <Tag label={t('scope.comingSoon')} tone="muted" />
        </View>
      )}
      <View className="mt-3">
        <Input label={t('scope.brand')} value={brand} onChangeText={setBrand} maxLength={80} editable={canSave} />
        <Input label={t('scope.attribution')} hint={t('scope.attributionHint')} value={attribution} onChangeText={setAttribution} maxLength={200} editable={canSave} />
      </View>
      <View className="self-start">
        <Button onPress={save} loading={actions.brand.isPending} disabled={actions.brand.isPending || !canSave}>
          {t('scope.saveBrand')}
        </Button>
      </View>
      {canSave ? null : <Text className="text-stone-500 text-sm mt-3 leading-5">{t('scope.whiteLabelMissing')}</Text>}
      <NoteView note={note} />
    </Section>
  );
}
