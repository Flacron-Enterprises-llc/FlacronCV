import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { BrandLogo } from '../src/components/brand/BrandLogo';
import { BrandBottomWave, BrandTopWave } from '../src/components/brand/BrandWaves';
import { CvIllustration } from '../src/components/brand/CvIllustration';
import { FeatureArt } from '../src/components/brand/FeatureArt';
import { Button } from '../src/components/ui/Button';
import { useT } from '../src/i18n';
import { useLightStatusBar } from '../src/hooks/useLightStatusBar';

const ONBOARDING_SEEN_KEY = 'flacroncv_onboarding_seen';

type Slide = { id: string; title: string; subtitle: string; badge?: string; art: React.ReactNode };

export default function OnboardingScreen() {
  const router = useRouter();
  const t = useT('onboarding');
  useLightStatusBar();
  const { width } = useWindowDimensions();
  const slides: Slide[] = useMemo(
    () => [
      {
        id: 'build',
        title: t('slides.build.title'),
        subtitle: t('slides.build.subtitle'),
        art: <CvIllustration width={250} />,
      },
      {
        id: 'engine',
        title: t('slides.engine.title'),
        subtitle: t('slides.engine.subtitle'),
        badge: t('slides.engine.badge'),
        art: (
          <FeatureArt
            icon="sparkles"
            satellites={[{ icon: 'create-outline' }, { icon: 'list-outline' }, { icon: 'mail-outline' }, { icon: 'checkmark-done-outline' }]}
          />
        ),
      },
      {
        id: 'export',
        title: t('slides.export.title'),
        subtitle: t('slides.export.subtitle'),
        // File format names; the same in every language.
        badge: 'PDF · DOCX',
        art: (
          <FeatureArt
            icon="download-outline"
            satellites={[{ icon: 'document-text', label: 'PDF' }, { icon: 'share-outline' }, { icon: 'document', label: 'DOCX' }, { icon: 'phone-portrait-outline' }]}
          />
        ),
      },
    ],
    [t],
  );
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
  }, [fade]);

  const finish = async (to: '/(auth)/register' | '/(auth)/login') => {
    await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    router.replace(to);
  };

  const next = () => {
    if (index < slides.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
      setIndex(index + 1);
    } else {
      void finish('/(auth)/register');
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <BrandTopWave height={72} />
      <View className="items-center">
        <BrandLogo width={200} />
      </View>

      <Animated.View style={{ flex: 1, opacity: fade }}>
        <FlatList
          ref={listRef}
          data={slides}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <View style={{ width }} className="flex-1 items-center justify-center px-8">
              {item.art}
              {item.badge ? (
                <View className="mt-5 rounded-full bg-navy px-3.5 py-1.5">
                  <Text className="text-xs font-semibold text-white">{item.badge}</Text>
                </View>
              ) : null}
              <Text className="mt-5 text-center text-[28px] font-black leading-9 text-ink" accessibilityRole="header">
                {item.title.replace(/\n/g, ' ')}
              </Text>
              <Text className="mt-3 text-center text-base leading-6 text-stone-600">{item.subtitle}</Text>
            </View>
          )}
        />
      </Animated.View>

      <View className="px-6 pb-2">
        <View className="mb-6 flex-row items-center justify-center gap-2" accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: slides.length, now: index + 1 }}>
          {slides.map((s, i) => (
            <View key={s.id} className={['h-2 rounded-full', i === index ? 'w-7 bg-brand-600' : 'w-2 bg-stone-300'].join(' ')} />
          ))}
        </View>
        <Button variant="primary" size="lg" pill fullWidth onPress={next}>
          {index === slides.length - 1 ? t('getStarted') : t('continue')}
        </Button>
        <Pressable onPress={() => void finish('/(auth)/login')} accessibilityRole="link" className="mt-2 min-h-[48px] items-center justify-center">
          <Text className="text-base text-stone-600">
            {t('haveAccount')} <Text className="font-bold text-brand-700 underline">{t('signIn')}</Text>
          </Text>
        </Pressable>
      </View>
      <BrandBottomWave height={44} />
    </View>
  );
}
