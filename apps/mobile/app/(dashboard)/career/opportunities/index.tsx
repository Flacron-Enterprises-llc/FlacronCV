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
import { checkPaste, locationsText, NOT_STATED, PASTE_MAX, payText, sponsorshipText } from '../../../../src/lib/career/opportunities';
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
    Alert.alert('Discard this advert?', 'The pasted text is not saved yet.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
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
        Alert.alert('Advert saved', `"${created.title}" is saved to your listings. Only you can see it.`, [
          { text: 'Stay here', style: 'cancel' },
          { text: 'Open it', onPress: () => router.push(`/(dashboard)/career/opportunities/${created.id}` as Href) },
        ]);
      },
      onError: (error) => setPasteError(careerErrorMessage(error, 'The advert was not saved. Your text is still here; try again.')),
    });
  };

  const mapButton = mapFeature.on ? (
    <TouchableOpacity
      onPress={() => router.push('/(dashboard)/career/opportunities/map' as Href)}
      className="h-11 w-11 items-center justify-center"
      accessibilityRole="button"
      accessibilityLabel="Open the map session list"
    >
      <Ionicons name="map-outline" size={22} color={colors.stone[700]} />
    </TouchableOpacity>
  ) : undefined;

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
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
        message={careerErrorMessage(list.error ?? access.error, 'Listings could not be loaded. Nothing was changed.')}
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
              Search your listings or paste a job advert. Missing pay and sponsorship stay not stated. A pasted advert is only yours.
            </Text>
            <Input
              label="Search"
              value={query}
              onChangeText={setQuery}
              placeholder="Title, employer or keyword"
              returnKeyType="search"
              onSubmitEditing={onSearch}
              accessibilityLabel="Search listings"
              maxLength={200}
            />
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <Button fullWidth onPress={onSearch} loading={list.isFetching && submitted !== ''} accessibilityLabel="Search listings">
                  Search
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
                  Paste advert
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
                accessibilityLabel={`Clear the search for ${submitted}`}
              >
                <Text className="text-stone-500 text-sm flex-1">{`Results for "${submitted}"`}</Text>
                <Text className="text-brand-600 text-sm font-semibold">Clear</Text>
              </TouchableOpacity>
            ) : null}
            {list.error ? (
              <Text className="text-red-500 text-sm mb-3">{careerErrorMessage(list.error, 'The list could not be refreshed.')}</Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          submitted ? (
            <EmptyState icon="search-outline" title="No listings" description="Try another search, or paste the vacancy." />
          ) : (
            <EmptyState icon="briefcase-outline" title="No saved listings yet" description="Paste a job advert to keep it here and compare it with your career CV." />
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push(`/(dashboard)/career/opportunities/${item.id}` as Href)}
            className="bg-white border border-stone-100 rounded-2xl p-4 mb-3"
            accessibilityRole="button"
            accessibilityLabel={`${item.title}${item.organization ? `, ${item.organization}` : ''}${item.label === 'expired' ? ', expired' : ''}`}
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 mr-2">
                <Text className="font-bold text-stone-900">{item.title}</Text>
                <Text className="text-stone-500 text-sm mt-0.5">{item.organization ?? NOT_STATED}</Text>
              </View>
              <Pill label={item.label === 'expired' ? 'EXPIRED' : 'OPEN'} tone={item.label === 'expired' ? 'default' : 'success'} />
            </View>
            <Meta icon="location-outline" text={locationsText(item.locations)} />
            <Meta icon="cash-outline" text={payText(item.compensation)} />
            <Meta icon="airplane-outline" text={sponsorshipText(item.sponsorship)} />
            {item.provider === 'paste' ? <Text className="text-stone-400 text-xs mt-2">Pasted by you</Text> : null}
          </TouchableOpacity>
        )}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title="Job search" right={mapButton} />
      {content}
      <Modal visible={pasteOpen} onClose={closePaste} title="Paste a job advert" size="lg" closeDisabled={paste.isPending}>
        <Text className="text-stone-500 text-sm mb-3 leading-5">
          Paste the full advert text. It is saved only to your account. Pay, sponsorship and locations that the text does not state stay not stated.
        </Text>
        <Text className="text-sm font-medium text-stone-700 mb-1.5">Advert text</Text>
        <TextInput
          value={pasteText}
          onChangeText={setPasteText}
          multiline
          maxLength={PASTE_MAX}
          textAlignVertical="top"
          accessibilityLabel="Advert text"
          placeholder="Paste the job advert here"
          placeholderTextColor={colors.stone[400]}
          className="bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[160px] mb-4"
        />
        <Input
          label="Link to the original, if you have one"
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
          Save pasted advert
        </Button>
      </Modal>
    </SafeAreaView>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View className="flex-row items-center mt-1.5">
      <Ionicons name={icon} size={14} color={colors.stone[400]} />
      <Text className="text-stone-600 text-xs ml-1.5 flex-1" numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}
