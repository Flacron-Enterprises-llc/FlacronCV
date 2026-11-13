import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, Share, Switch, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useEvidenceList } from '../../../../src/hooks/career/evidence';
import { WEB_ORIGIN, usePortfolio, usePortfolioActions, usePortfolioGate, usePortfolioQr } from '../../../../src/hooks/career/portfolios';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import {
  EMPTY_PORTFOLIO_FORM,
  PORTFOLIO_LIMITS,
  formFromPortfolio,
  portfolioErrorMessage,
  portfolioFormDirty,
  portfolioLoadState,
  portfolioSharePath,
  portfolioShareUrl,
  toCreatePortfolioInput,
  toUpdatePortfolioInput,
  toggleEvidenceId,
  validatePortfolioForm,
  visibilityPill,
  visitsText,
  type PortfolioForm,
  type PortfolioFormErrors,
} from '../../../../src/lib/career/portfolios';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import type { PortfolioPage } from '../../../../../../packages/career-api-client/src/types';
import { useT } from '../../../../src/i18n';

/**
 * One portfolio page: create (route id "new"), edit title / headline / display
 * name / contact options / chosen evidence, publish publicly or as a private
 * link, unpublish, replace the private link, see visits, share the link and
 * show its QR code. Same actions as the website.
 */
export default function PortfolioScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === 'string' ? rawId : undefined;
  const isNew = id === 'new';
  const router = useRouter();
  const t = useT('careerPortfolios');
  const tc = useT('common');
  const access = useCareerAccess();
  const gate = usePortfolioGate();
  const page = usePortfolio(isNew ? undefined : id);
  const evidence = useEvidenceList();
  const qr = usePortfolioQr(page.data);
  const actions = usePortfolioActions();

  const [form, setForm] = useState<PortfolioForm | null>(null);
  const [errors, setErrors] = useState<PortfolioFormErrors>({});
  const [note, setNote] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const base = page.data ? formFromPortfolio(page.data) : EMPTY_PORTFOLIO_FORM;
  const current = form ?? base;
  const dirty = form !== null && portfolioFormDirty(form, base);
  useLeaveGuard(dirty);

  useEffect(() => {
    if (!createdId || dirty) return;
    router.replace(`/(dashboard)/career/portfolios/${encodeURIComponent(createdId)}` as Href);
    setCreatedId(null);
  }, [createdId, dirty, router]);

  const set = <K extends keyof PortfolioForm>(key: K, value: PortfolioForm[K]) => {
    setForm({ ...current, [key]: value });
    setNote(null);
    if (key in errors) setErrors({ ...errors, [key]: undefined });
  };

  const working =
    actions.create.isPending || actions.update.isPending || actions.publish.isPending || actions.unpublish.isPending || actions.revoke.isPending;

  const failed = (title: string) => (error: unknown) => Alert.alert(title, portfolioErrorMessage(error));

  const onSave = () => {
    const found = validatePortfolioForm(current);
    setErrors(found);
    if (Object.keys(found).length > 0 || working) return;
    if (isNew) {
      actions.create.mutate(toCreatePortfolioInput(current), {
        onSuccess: (created) => {
          setForm(null);
          setCreatedId(created.id);
        },
        onError: failed(t('editor.notCreated')),
      });
      return;
    }
    if (!page.data || !dirty) return;
    actions.update.mutate(
      { id: page.data.id, body: toUpdatePortfolioInput(current) },
      {
        onSuccess: () => {
          setForm(null);
          setNote(t('editor.saved'));
        },
        onError: (error) => Alert.alert(t('editor.notSaved'), [portfolioErrorMessage(error), t('editor.changesKept')].join(' ')),
      },
    );
  };

  const savedFirst = () => {
    if (!dirty) return true;
    Alert.alert(t('editor.saveFirstTitle'), t('editor.saveFirstBody'));
    return false;
  };

  const onPublish = (target: PortfolioPage, visibility: 'public' | 'private') => {
    if (!savedFirst() || working) return;
    actions.publish.mutate(
      { id: target.id, visibility },
      {
        onSuccess: () => setNote(visibility === 'public' ? t('editor.published') : t('editor.privateReady')),
        onError: failed(t('editor.notPublished')),
      },
    );
  };

  const onUnpublish = (target: PortfolioPage) => {
    if (working) return;
    Alert.alert(t('editor.unpublishTitle'), t('editor.unpublishBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: t('editor.unpublish'),
        style: 'destructive',
        onPress: () =>
          actions.unpublish.mutate(target.id, {
            onSuccess: () => setNote(t('editor.unpublished')),
            onError: failed(t('editor.notUnpublished')),
          }),
      },
    ]);
  };

  const onRevoke = (target: PortfolioPage) => {
    if (working) return;
    Alert.alert(t('editor.revokeTitle'), t('editor.revokeBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: t('editor.replaceLink'),
        style: 'destructive',
        onPress: () =>
          actions.revoke.mutate(target.id, {
            onSuccess: () => setNote(t('editor.revoked')),
            onError: failed(t('editor.notReplaced')),
          }),
      },
    ]);
  };

  const onShare = async (url: string, target: PortfolioPage) => {
    try {
      await Share.share(Platform.OS === 'ios' ? { url, message: target.title } : { message: url, title: target.title });
    } catch {
      Alert.alert(t('editor.notShared'), t('editor.shareFailed'));
    }
  };

  const onOpen = (url: string) => {
    void WebBrowser.openBrowserAsync(url).catch(() => Alert.alert(t('editor.openFailed'), t('editor.tryAgain')));
  };

  const title = isNew ? t('editor.newTitle') : (page.data?.title ?? t('editor.fallbackTitle'));
  const loadState = page.error ? portfolioLoadState(page.error) : null;

  let content: React.ReactNode;
  if (gate === 'locked') {
    content = <EmptyState icon="lock-closed-outline" title={t('gate.locked')} />;
  } else if (gate === 'off' || loadState === 'off') {
    content = <EmptyState icon="lock-closed-outline" title={t('gate.offTitle')} description={t('gate.offBody')} />;
  } else if (loadState === 'upgrade') {
    content = <EmptyState icon="lock-closed-outline" title={t('gate.upgradeTitle')} description={t('gate.upgradeBody')} />;
  } else if (gate === 'loading' || (!isNew && page.isLoading)) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (gate === 'error' || (!isNew && (page.error || !page.data))) {
    content = (
      <ErrorState
        message={careerErrorMessage(page.error ?? access.error, t('gate.loadFailed'))}
        onRetry={() => void (page.error ? page.refetch() : access.refetch())}
      />
    );
  } else {
    const saved = page.data;
    const pill = saved ? visibilityPill(saved.visibility) : null;
    const sharePath = saved ? portfolioSharePath(saved) : null;
    const shareUrl = saved ? portfolioShareUrl(WEB_ORIGIN, saved) : null;
    const visits = saved ? visitsText(saved.visitCount) : null;
    const items = evidence.data?.items ?? [];

    content = (
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          {saved && pill ? (
            <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
              <View className="flex-row items-center justify-between mb-2">
                <Pill label={pill.label} tone={pill.tone} />
                <Text className="text-stone-500 text-xs">{visits ?? t('editor.visitsHidden')}</Text>
              </View>

              {saved.visibility === 'draft' ? (
                <Text className="text-stone-500 text-sm leading-5">{t('editor.draftHint')}</Text>
              ) : shareUrl ? (
                <>
                  <Text selectable className="text-stone-900 text-sm mb-3" accessibilityLabel={t('editor.linkA11y', { url: shareUrl })}>
                    {shareUrl}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      className="min-h-[44px]"
                      onPress={() => void onShare(shareUrl, saved)}
                      icon={<Ionicons name="share-outline" size={16} color={colors.white} />}
                    >
                      {t('editor.shareLink')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[44px]"
                      onPress={() => onOpen(shareUrl)}
                      icon={<Ionicons name="open-outline" size={16} color={colors.stone[700]} />}
                    >
                      {t('editor.openPage')}
                    </Button>
                  </View>
                  <View className="items-center mt-4" accessible accessibilityRole="image" accessibilityLabel={t('editor.qrA11y')}>
                    {qr.isLoading ? (
                      <ActivityIndicator color={colors.brand[600]} />
                    ) : qr.data ? (
                      <View className="bg-white p-2 rounded-xl border border-stone-100">
                        <SvgXml xml={qr.data.svg} width={200} height={200} />
                      </View>
                    ) : (
                      <Text className="text-stone-500 text-xs text-center">
                        {qr.error ? careerErrorMessage(qr.error, t('editor.qrFailed')) : ''}
                      </Text>
                    )}
                    {qr.data ? <Text className="text-stone-400 text-xs mt-2 text-center">{t('editor.qrHint')}</Text> : null}
                  </View>
                </>
              ) : (
                <>
                  {sharePath ? (
                    <Text selectable className="text-stone-900 text-sm mb-2">
                      {sharePath}
                    </Text>
                  ) : null}
                  <Text className="text-stone-500 text-xs leading-5">
                    {t('editor.noWebOrigin')}
                  </Text>
                </>
              )}

              <View className="flex-row flex-wrap gap-2 mt-4">
                {saved.visibility !== 'public' ? (
                  <Button size="sm" variant="secondary" className="min-h-[44px]" disabled={working} onPress={() => onPublish(saved, 'public')}>
                    {t('editor.publish')}
                  </Button>
                ) : null}
                {saved.visibility !== 'private' ? (
                  <Button size="sm" variant="outline" className="min-h-[44px]" disabled={working} onPress={() => onPublish(saved, 'private')}>
                    {t('editor.createPrivate')}
                  </Button>
                ) : null}
                {saved.visibility === 'private' ? (
                  <Button size="sm" variant="outline" className="min-h-[44px]" disabled={working} onPress={() => onRevoke(saved)}>
                    {t('editor.replacePrivate')}
                  </Button>
                ) : null}
                {saved.visibility !== 'draft' ? (
                  <Button size="sm" variant="ghost" className="min-h-[44px]" disabled={working} onPress={() => onUnpublish(saved)}>
                    {t('editor.unpublish')}
                  </Button>
                ) : null}
              </View>
              {working ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.brand[600]} /> : null}
            </View>
          ) : null}

          {note ? (
            <Text className="text-success text-sm mb-3" accessibilityLiveRegion="polite">
              {note}
            </Text>
          ) : null}

          <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
            <Input
              label={t('editor.titleLabel')}
              value={current.title}
              onChangeText={(v) => set('title', v)}
              maxLength={PORTFOLIO_LIMITS.title}
              error={errors.title}
              accessibilityLabel={t('editor.titleA11y')}
            />
            <Input label={t('editor.headline')} value={current.headline} onChangeText={(v) => set('headline', v)} maxLength={PORTFOLIO_LIMITS.headline} error={errors.headline} />
            <Input
              label={t('editor.displayName')}
              value={current.displayName}
              onChangeText={(v) => set('displayName', v)}
              maxLength={PORTFOLIO_LIMITS.displayName}
              error={errors.displayName}
              hint={t('editor.slugStable')}
            />

            {!isNew ? (
              <>
                <Input
                  label={t('editor.email')}
                  value={current.contactEmail}
                  onChangeText={(v) => set('contactEmail', v)}
                  maxLength={PORTFOLIO_LIMITS.contactEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={errors.contactEmail}
                />
                <ToggleRow label={t('editor.showEmail')} value={current.showEmail} onChange={(v) => set('showEmail', v)} />
                <Input
                  label={t('editor.phone')}
                  value={current.contactPhone}
                  onChangeText={(v) => set('contactPhone', v)}
                  maxLength={PORTFOLIO_LIMITS.contactPhone}
                  keyboardType="phone-pad"
                  error={errors.contactPhone}
                />
                <ToggleRow label={t('editor.showPhone')} value={current.showPhone} onChange={(v) => set('showPhone', v)} />
              </>
            ) : (
              <Text className="text-stone-400 text-xs">{t('editor.afterCreate')}</Text>
            )}
          </View>

          {!isNew ? (
            <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
              <Text className="font-bold text-stone-900 mb-1">{t('editor.workTitle')}</Text>
              <Text className="text-stone-500 text-xs mb-2 leading-5">{t('editor.workHint')}</Text>
              {evidence.isLoading ? <ActivityIndicator color={colors.brand[600]} /> : null}
              {evidence.error ? <Text className="text-stone-500 text-sm">{t('editor.evidenceFailed')}</Text> : null}
              {!evidence.isLoading && !evidence.error && items.length === 0 ? (
                <Text className="text-stone-500 text-sm">{t('editor.evidenceEmpty')}</Text>
              ) : null}
              {items.map((item) => {
                const checked = current.evidenceIds.includes(item.id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => set('evidenceIds', toggleEvidenceId(current.evidenceIds, item.id))}
                    className="flex-row items-center min-h-[44px] py-1"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    accessibilityLabel={item.title}
                  >
                    <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.brand[600] : colors.stone[400]} />
                    <View className="ms-3 flex-1">
                      <Text className="text-stone-900">{item.title}</Text>
                      {!item.isPortfolioShared ? <Text className="text-stone-400 text-xs">{t('editor.privateOnly')}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          <Button onPress={onSave} loading={actions.create.isPending || actions.update.isPending} disabled={working || (!isNew && !dirty) || current.title.trim().length === 0} fullWidth>
            {isNew ? t('editor.createPage') : dirty ? t('editor.savePage') : t('editor.savedButton')}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={title} subtitle={isNew ? t('editor.newSubtitle') : undefined} />
      {content}
    </SafeAreaView>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View className="flex-row items-center justify-between min-h-[44px] mb-3">
      <Text className="text-sm font-medium text-stone-700 flex-1 me-3">{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.brand[600], false: colors.stone[300] }}
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
      />
    </View>
  );
}
