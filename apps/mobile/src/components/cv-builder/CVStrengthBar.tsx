import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useT } from '../../i18n';
import { RTL_FLIP } from '../../i18n/native';
import { cvStrength, type StrengthSection } from '../../lib/cv-strength';
import { useCVStore } from '../../store/cv-store';
import { colors } from '../../theme/colors';
import { Modal } from '../ui/Modal';

const BAND_COLOR = { starter: '#dc2626', good: '#d97706', strong: '#65a30d', complete: '#059669' } as const;

/**
 * Slim "CV strength" bar above the editor wizard: score and a progress line;
 * tap for the next steps that would raise it most. Live as the person edits.
 * Completeness only — it never judges the writing.
 */
export function CVStrengthBar() {
  const t = useT('cvEditor');
  const cv = useCVStore((s) => s.cv);
  const sections = useCVStore((s) => s.sections);
  const [open, setOpen] = useState(false);
  const strength = useMemo(
    () =>
      cvStrength(
        cv?.personalInfo,
        sections as unknown as StrengthSection[],
        (cv as unknown as { sampleSummary?: string | null } | null)?.sampleSummary ?? null,
      ),
    [cv, sections],
  );
  if (!cv) return null;
  const { score, band, tips } = strength;
  const color = BAND_COLOR[band];
  const bandLabel = t(`strength.band_${band}`);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('strength.title')}: ${score}/100, ${bandLabel}`}
        accessibilityHint={tips.length ? t('strength.toggle_show') : undefined}
        className="flex-row items-center border-b border-stone-100 bg-surface px-4 py-2.5 active:bg-stone-50"
      >
        <Ionicons name={band === 'complete' ? 'checkmark-circle' : 'speedometer-outline'} size={18} color={color} />
        <Text className="ms-2 text-xs font-bold uppercase tracking-wide text-stone-500">{t('strength.title')}</Text>
        <View className="mx-3 h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200">
          <View className="h-1.5 rounded-full" style={{ width: `${Math.max(score, 3)}%`, backgroundColor: color }} />
        </View>
        <Text className="text-sm font-black text-ink">{score}</Text>
        <Text className="ms-1.5 text-xs font-semibold" style={{ color }}>
          {bandLabel}
        </Text>
        <Ionicons name="chevron-forward" size={16} color={colors.stone[400]} style={[{ marginStart: 4 }, RTL_FLIP]} />
      </Pressable>

      <Modal visible={open} onClose={() => setOpen(false)} title={t('strength.title')}>
        <View className="px-5 pb-6 pt-2">
          <View className="flex-row items-end">
            <Text className="text-4xl font-black text-ink">{score}</Text>
            <Text className="mb-1.5 ms-1 text-base font-semibold text-stone-500">/100</Text>
            <Text className="mb-1.5 ms-3 text-base font-bold" style={{ color }}>
              {bandLabel}
            </Text>
          </View>
          <View className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200">
            <View className="h-2 rounded-full" style={{ width: `${Math.max(score, 3)}%`, backgroundColor: color }} />
          </View>
          <Text className="mt-2 text-xs text-stone-500">{t('strength.note')}</Text>

          {tips.length === 0 ? (
            <Text className="mt-5 text-sm font-semibold text-success">{t('strength.complete_msg')}</Text>
          ) : (
            <>
              <Text className="mb-2 mt-5 text-sm font-bold text-stone-700">{t('strength.next_steps')}</Text>
              {tips.map((tip) => (
                <View key={tip.key} className="flex-row items-center border-b border-stone-100 py-3">
                  <View className="h-7 w-7 items-center justify-center rounded-full bg-brand-50">
                    <Ionicons name="add" size={16} color={colors.brand[600]} />
                  </View>
                  <Text className="ms-3 flex-1 text-[15px] text-stone-800">{t(`strength.tip_${tip.key}`)}</Text>
                  <Text className="text-sm font-bold text-success">{t('strength.points', { points: tip.points })}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      </Modal>
    </>
  );
}
