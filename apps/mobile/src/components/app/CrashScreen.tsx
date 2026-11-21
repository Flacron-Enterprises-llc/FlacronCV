import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/palette';

const ORANGE = '#ea580c';
const NAVY = '#10294f';

/**
 * Shown instead of a white screen / app close when a screen throws. Uses
 * explicit colours (not theme classes) because it may render outside the
 * themed root when the root layout itself failed. "Try again" re-mounts it.
 */
export function CrashScreen({ onRetry }: { onRetry: () => void }) {
  const t = useT('common');
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  return (
    <View
      style={{ flex: 1, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingTop: insets.top, paddingBottom: insets.bottom }}
      accessibilityRole="alert"
    >
      <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(234,88,12,0.12)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="warning-outline" size={40} color={ORANGE} />
      </View>
      <Text style={{ marginTop: 22, fontSize: 24, fontWeight: '900', color: palette.scheme === 'dark' ? '#fafaf9' : NAVY, textAlign: 'center' }} accessibilityRole="header">
        {t('crashTitle')}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 15, lineHeight: 22, color: palette.scheme === 'dark' ? '#d6d3d1' : '#57534e', textAlign: 'center' }}>{t('crashBody')}</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => ({ marginTop: 28, minHeight: 52, minWidth: 220, paddingHorizontal: 28, borderRadius: 999, backgroundColor: pressed ? '#c2410c' : ORANGE, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' })}
      >
        <Ionicons name="refresh" size={18} color="#ffffff" style={{ marginEnd: 8 }} />
        <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '700' }}>{t('retry')}</Text>
      </Pressable>
    </View>
  );
}
