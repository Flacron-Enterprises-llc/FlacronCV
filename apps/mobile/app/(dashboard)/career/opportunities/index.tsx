import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Alert, FlatList, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Input } from '../../../../src/components/ui/Input';
import { Modal } from '../../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import { useCareerFeature, useOpportunitySearch, usePasteOpportunity } from '../../../../src/hooks/career/opportunities';
import { useLeaveGuard } from '../../../../src/hooks/useLeaveGuard';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import { useT } from '../../../../src/i18n';
import { checkPaste, locationsText, notStated, PASTE_MAX, payText, sponsorshipText } from '../../../../src/lib/career/opportunities';
import { careerErrorMessage } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

/**
 * Job search over the career service: search the listings the account can see
 * and paste a job advert to keep it. A pasted advert is only visible to this
 * account. No licensed job feed is promised: missing pay and sponsorship stay
 * "Not stated". Same flow as the website's job search page.
 */
export default function CareerOpportunitiesScreen() {
  const router = useRouter();
  const t = useT('careerJobs');
  const tk = useT('career');
  const access = useCareerAccess();
  const mapFeature = useCareerFeature('mapSessions');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const list = useOpportunitySearch(submitted);
  const paste = usePasteOpportunity();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const pasteDirty = pasteText.trim().length > 0 || sourceUrl.trim().length > 0;
  useLeaveGuard(pasteDirty);

  const onSearch = () => setSubmitted(query.trim());

  const closePaste = () => {
    if (paste.isPending) return;
    if (!pasteDirty) {
      setPasteOpen(false);
      return;
    }
    Alert.alert(t('list.discardTitle'), t('list.discardBody'), [
      { text: tk('shared.keepEditing'), style: 'cancel' },
      {
        text: tk('shared.discard'),
        style: 'destructive',
        onPress: () => {
          setPasteText('');
          setSourceUrl('');
          setPasteError(null);
          setPasteOpen(false);
        },
      },
    ]);
  };

  const onSavePaste = () => {
    const checked = checkPaste(pasteText, sourceUrl);
    if (!checked.ok) {
      setPasteError(checked.message);
      return;
    }
    setPasteError(null);
    paste.mutate(checked.input, {
      onSuccess: (created) => {
        setPasteText('');
        setSourceUrl('');
        setPasteOpen(false);
        Alert.alert(t('list.savedTitle'), t('list.savedBody', { title: created.title }), [
          { text: t('list.stayHere'), style: 'cancel' },
          { text: t('list.openIt'), onPress: () => router.push(`/(dashboard)/career/opportunities/${created.id}` as Href) },
        ]);
      },
      onError: (error) => setPasteError(careerErrorMessage(error, t('list.saveFailed'))),
    });
  };

  const mapButton = mapFeature.on ? (
    <TouchableOpacity
      onPress={() => router.push('/(dashboard)/career/opportunities/map' as Href)}
      className="h-11 w-11 items-center justify-center"
      accessibilityRole="button"
      accessibilityLabel={t('list.mapA11y')}
    >
      <Ionicons name="map-outline" size={22} color={colors.stone[700]} />
    </TouchableOpacity>
  ) : undefined;

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={tk('shared.notIncluded')} />;
  } else if (access.isLoading || list.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (access.error || (list.error && !list.data)) {
    content = (
      <ErrorState
        message={careerErrorMessage(list.error ?? access.error, t('list.loadFailed'))}
        onRetry={() => {
          void access.refetch();
          void list.refetch();
        }}
      />
    );
  } else {
    content = (
      <FlatList
        data={list.data?.items ?? []}
        keyExtractor={(o) => o.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand[600]} />}
        ListHeaderComponent={
          <View className="mb-2">
            <Text className="text-stone-500 text-sm mb-4 leading-5">
              {t('list.intro')}
            </Text>
            <Input
              label={t('list.search')}
              value={query}
              onChangeText={setQuery}
              placeholder={t('list.searchPlaceholder')}
              returnKeyType="search"
              onSubmitEditing={onSearch}
              accessibilityLabel={tk('shared.searchListings')}
              maxLength={200}
            />
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <Button fullWidth onPress={onSearch} loading={list.isFetching && submitted !== ''} accessibilityLabel={tk('shared.searchListings')}>
                  {t('list.search')}
                </Button>
              </View>
              <View className="flex-1">
                <Button
                  fullWidth
                  variant="outline"
                  onPress={() => {
                    setPasteError(null);
                    setPasteOpen(true);
                  }}
                  icon={<Ionicons name="clipboard-outline" size={18} color={colors.stone[700]} />}
                >
                  {t('list.pasteAdvert')}
                </Button>
              </View>
            </View>
            {submitted ? (
              <TouchableOpacity
                onPress={() => {
                  setQuery('');
                  setSubmitted('');
                }}
                className="flex-row items-center mb-3 min-h-[44px]"
                accessibilityRole="button"
                accessibilityLabel={t('list.clearA11y', { query: submitted })}
              >
                <Text className="text-stone-500 text-sm flex-1">{t('list.resultsFor', { query: submitted })}</Text>
                <Text className="text-brand-600 text-sm font-semibold">{t('list.clear')}</Text>
              </TouchableOpacity>
            ) : null}
            {list.error ? (
              <Text className="text-red-500 text-sm mb-3">{careerErrorMessage(list.error, t('list.refreshFailed'))}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          submitted ? (
            <EmptyState icon="search-outline" title={tk('shared.noListings')} description={t('list.noResultsBody')} />
          ) : (
            <EmptyState icon="briefcase-outline" title={t('list.emptyTitle')} description={t('list.emptyBody')} />
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/(dashboard)/career/opportunities/${item.id}` as Href)}
            className="bg-white border border-stone-100 rounded-2xl p-4 mb-3"
            accessibilityRole="button"
            accessibilityLabel={[item.title, item.organization, item.label === 'expired' ? t('list.expiredA11y') : null].filter(Boolean).join(', ')}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 me-2">
                <Text className="font-bold text-stone-900">{item.title}</Text>
                <Text className="text-stone-500 text-sm mt-0.5">{item.organization ?? notStated()}</Text>
              </View>
              <Pill label={item.label === 'expired' ? tk('shared.expiredPill') : tk('shared.openPill')} tone={item.label === 'expired' ? 'default' : 'success'} />
            </View>
            <Meta icon="location-outline" text={locationsText(item.locations)} />
            <Meta icon="cash-outline" text={payText(item.compensation)} />
            <Meta icon="airplane-outline" text={sponsorshipText(item.sponsorship)} />
            {item.provider === 'paste' ? <Text className="text-stone-400 text-xs mt-2">{t('list.pastedByYou')}</Text> : null}
          </TouchableOpacity>
        )}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={tk('areas.opportunities.title')} right={mapButton} />
      {content}
      <Modal visible={pasteOpen} onClose={closePaste} title={t('list.pasteTitle')} size="lg" closeDisabled={paste.isPending}>
        <Text className="text-stone-500 text-sm mb-3 leading-5">
          {t('list.pasteBody')}
        </Text>
        <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('list.advertText')}</Text>
        <TextInput
          value={pasteText}
          onChangeText={setPasteText}
          multiline
          maxLength={PASTE_MAX}
          textAlignVertical="top"
          accessibilityLabel={t('list.advertText')}
          placeholder={t('list.pastePlaceholder')}
          placeholderTextColor={colors.stone[400]}
          className="bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[160px] mb-4"
        />
        <Input
          label={t('list.link')}
          value={sourceUrl}
          onChangeText={setSourceUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://"
          maxLength={2000}
        />
        {pasteError ? (
          <Text className="text-red-500 text-sm mb-3" accessibilityRole="alert">
            {pasteError}
          </Text>
        ) : null}
        <Button fullWidth onPress={onSavePaste} loading={paste.isPending}>
          {t('list.savePasted')}
        </Button>
      </Modal>
    </SafeAreaView>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View className="flex-row items-center mt-1.5">
      <Ionicons name={icon} size={14} color={colors.stone[400]} />
      <Text className="text-stone-600 text-xs ms-1.5 flex-1" numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}
