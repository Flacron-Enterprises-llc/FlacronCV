import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import {
  AccessibilityInfo,
  Modal as RNModal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTour } from '../../hooks/useAppTour';
import { useT } from '../../i18n';
import { progressLabel, stepTitle } from '../../lib/app-tour';
import { colors } from '../../theme/colors';
import { Button } from '../ui/Button';

/** Clears the tab bar on tab roots; stack screens without a bar get a little extra room. */
const BAR_BOTTOM_OFFSET = 64;

/**
 * Step card for the mobile app tour. React Native has no DOM spotlight, so
 * each step is a bottom sheet (title, body, step counter, Back / Skip / Next)
 * with a "Show me" action that opens the matching tab and collapses the card
 * to a small bar until the user continues.
 *
 * Render once inside <AppTourProvider> (src/hooks/useAppTour.ts), as a
 * sibling of the dashboard <Tabs> so the collapsed bar floats above screens.
 */
export function AppTour() {
  const { view, firstName, next, back, skip, showMe, expand } = useAppTour();
  const t = useT('tour');
  const tc = useT('common');
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const step = view ? view.steps[view.index] : null;
  const title = step ? stepTitle(step, firstName) : '';
  const progress = view ? progressLabel(view.index, view.steps.length) : '';
  const expanded = !!view && !view.minimized;

  useEffect(() => {
    if (expanded && step) {
      AccessibilityInfo.announceForAccessibility(t('announce', { progress, title }));
    }
  }, [expanded, step, progress, title, t]);

  if (!view || !step) return null;

  const isFirst = view.index === 0;
  const isLast = view.index === view.steps.length - 1;

  if (view.minimized) {
    return (
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          start: 16,
          end: 16,
          bottom: insets.bottom + BAR_BOTTOM_OFFSET,
        }}
      >
        <View
          className="bg-white rounded-2xl border border-stone-200 flex-row items-center ps-4 pe-1 py-1"
          style={{ elevation: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}
        >
          <View className="flex-1 py-2" accessible accessibilityLabel={t('minimizedLabel', { progress, title })}>
            <Text className="text-xs font-semibold text-brand-700">{progress}</Text>
            <Text className="text-sm font-bold text-stone-900" numberOfLines={1}>
              {title}
            </Text>
          </View>
          <Pressable
            onPress={expand}
            accessibilityRole="button"
            accessibilityLabel={t('continue')}
            className="min-h-[44px] px-3 items-center justify-center rounded-xl active:bg-stone-100"
          >
            <Text className="text-sm font-bold text-brand-700">{t('continue')}</Text>
          </Pressable>
          <Pressable
            onPress={skip}
            accessibilityRole="button"
            accessibilityLabel={t('skipTour')}
            hitSlop={4}
            className="w-11 h-11 items-center justify-center rounded-xl active:bg-stone-100"
          >
            <Ionicons name="close" size={20} color={colors.stone[500]} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <RNModal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      // Android back collapses the card (reversible) instead of ending the tour.
      onRequestClose={showMe}
    >
      <View className="flex-1 bg-black/50 justify-end">
        <View
          accessibilityViewIsModal
          accessibilityLabel={t('dialogLabel')}
          className="bg-white rounded-t-3xl px-5 pt-3"
          style={{ paddingBottom: insets.bottom + 16, maxHeight: windowHeight * 0.85 }}
        >
          <View className="items-center pb-3">
            <View className="w-10 h-1 rounded-full bg-stone-200" />
          </View>

          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xs font-semibold uppercase tracking-wide text-brand-700">{progress}</Text>
            <Pressable
              onPress={skip}
              accessibilityRole="button"
              accessibilityLabel={t('skipTour')}
              className="min-h-[44px] px-2 items-center justify-center rounded-xl active:bg-stone-100"
            >
              <Text className="text-sm font-semibold text-stone-500">{t('skip')}</Text>
            </Pressable>
          </View>

          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" className="text-xl font-black text-stone-900 mb-2">
              {title}
            </Text>
            <Text className="text-base text-stone-600 leading-6 mb-4">{step.body}</Text>

            {/* Step dots: visual only; the counter above carries the information. */}
            <View
              className="flex-row justify-center mb-4"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {view.steps.map((s, i) => (
                <View
                  key={s.id}
                  className={`h-1.5 rounded-full mx-0.5 ${i === view.index ? 'w-5 bg-brand-600' : 'w-1.5 bg-stone-200'}`}
                />
              ))}
            </View>

            <Button
              variant="outline"
              fullWidth
              onPress={showMe}
              accessibilityRole="button"
              accessibilityLabel={step.showLabel}
              accessibilityHint={t('showMeHint')}
              icon={<Ionicons name="eye-outline" size={18} color={colors.stone[700]} />}
              className="mb-3"
            >
              {step.showLabel}
            </Button>

            <View className="flex-row">
              {!isFirst && (
                <View className="flex-1 me-2">
                  <Button variant="ghost" fullWidth onPress={back} accessibilityRole="button" accessibilityLabel={tc('back')}>
                    {tc('back')}
                  </Button>
                </View>
              )}
              <View className="flex-1">
                <Button
                  variant="primary"
                  fullWidth
                  onPress={next}
                  accessibilityRole="button"
                  accessibilityLabel={isLast ? t('finishTour') : t('next')}
                >
                  {isLast ? t('finish') : t('next')}
                </Button>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </RNModal>
  );
}

export default AppTour;

export { AppTourProvider, useAppTour, useAppTourReplay } from '../../hooks/useAppTour';
