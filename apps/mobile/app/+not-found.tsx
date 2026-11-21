import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { BrandLogo } from '../src/components/brand/BrandLogo';
import { BrandBottomWave, BrandTopWave } from '../src/components/brand/BrandWaves';
import { FeatureArt } from '../src/components/brand/FeatureArt';
import { Button } from '../src/components/ui/Button';
import { useLightStatusBar } from '../src/hooks/useLightStatusBar';
import { useT } from '../src/i18n';

/** A link to a screen that does not exist (old notification, mistyped deep link). */
export default function NotFoundScreen() {
  const t = useT('common');
  const router = useRouter();
  useLightStatusBar();
  return (
    <View className="flex-1 bg-surface">
      <BrandTopWave height={72} />
      <View className="items-center">
        <BrandLogo width={190} />
      </View>
      <View className="flex-1 items-center justify-center px-8">
        <FeatureArt icon="compass-outline" size={220} />
        <Text className="mt-6 text-center text-[26px] font-black text-ink" accessibilityRole="header">
          {t('notFoundTitle')}
        </Text>
        <Text className="mt-2 text-center text-base leading-6 text-stone-600">{t('notFoundBody')}</Text>
        <View className="mt-8 w-full max-w-sm">
          <Button variant="primary" size="lg" pill fullWidth onPress={() => router.replace('/')}>
            {t('notFoundHome')}
          </Button>
        </View>
      </View>
      <BrandBottomWave height={48} />
    </View>
  );
}
