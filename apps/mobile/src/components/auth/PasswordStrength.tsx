import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useT } from '../../i18n';
import type { PasswordStrength as Strength } from '../../lib/auth-quality';
import { colors } from '../../theme/colors';

// Constant hues (readable on both light and dark surfaces).
const BAR = ['', '#ef4444', '#f59e0b', '#84cc16', '#10b981'];
const TEXT = ['', '#dc2626', '#b45309', '#4d7c0f', '#047857'];

/** Live meter under a new-password field: four segments, a word, and the checklist behind it. */
export function PasswordStrengthMeter({ strength }: { strength: Strength }) {
  const t = useT('auth');
  const { level, checks, common } = strength;
  const items: Array<[keyof Strength['checks'], string]> = [
    ['length', t('strength.length')],
    ['mixedCase', t('strength.case')],
    ['number', t('strength.number')],
    ['symbol', t('strength.symbol')],
  ];
  return (
    <View className="-mt-2 mb-4">
      <View className="flex-row items-center">
        <View className="flex-1 flex-row gap-1.5" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {[1, 2, 3, 4].map((seg) => (
            <View
              key={seg}
              className={level >= seg ? 'h-1.5 flex-1 rounded-full' : 'h-1.5 flex-1 rounded-full bg-stone-200'}
              style={level >= seg ? { backgroundColor: BAR[level] } : undefined}
            />
          ))}
        </View>
        <Text
          className="ms-3 min-w-[64px] text-end text-xs font-bold"
          style={{ color: level ? TEXT[level] : colors.stone[500] }}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${t('strength.label')}: ${t(`strength.level${level}`)}`}
        >
          {t(`strength.level${level}`)}
        </Text>
      </View>
      {common ? (
        <Text className="mt-2 text-xs font-medium text-error">{t('strength.common')}</Text>
      ) : (
        <View className="mt-2 flex-row flex-wrap">
          {items.map(([key, label]) => (
            <View
              key={key}
              className="w-1/2 flex-row items-center py-0.5"
              accessible
              accessibilityLabel={checks[key] ? `${label}, ${t('strength.met')}` : label}
            >
              <Ionicons
                name={checks[key] ? 'checkmark-circle' : 'ellipse-outline'}
                size={14}
                color={checks[key] ? '#047857' : colors.stone[400]}
              />
              <Text className={['ms-1.5 text-xs', checks[key] ? 'text-success' : 'text-stone-500'].join(' ')}>{label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** "Did you mean ada@gmail.com?" — tap to fix. */
export function EmailSuggestion({ suggestion, onAccept }: { suggestion: string | null; onAccept: (email: string) => void }) {
  const t = useT('auth');
  if (!suggestion) return null;
  return (
    <Pressable
      onPress={() => onAccept(suggestion)}
      accessibilityRole="button"
      className="-mt-2 mb-4 min-h-[32px] flex-row flex-wrap items-center"
      hitSlop={6}
    >
      <Ionicons name="sparkles-outline" size={14} color={colors.brand[600]} style={{ marginEnd: 6 }} />
      <Text className="text-sm font-semibold text-brand-700 underline">{t('emailSuggest', { email: suggestion })}</Text>
    </Pressable>
  );
}
