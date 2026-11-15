import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useT } from '../../i18n';
import { formatDateDigits, formatDateTimeDigits, localDayFromToday } from '../../lib/job-workspace';
import { colors } from '../../theme/colors';
import { Input } from '../ui/Input';

/**
 * Date entry without a native date-picker module (none is installed): a number
 * pad that shapes the digits as YYYY-MM-DD (or YYYY-MM-DDTHH:mm) while typing,
 * quick picks for common dates, and a clear button. Validation stays with the
 * form that owns the value.
 */
export function DateInput({
  label,
  value,
  onChange,
  error,
  hint,
  withTime = false,
  quickPicks = [0, 7, 14],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  withTime?: boolean;
  /** Days from today offered as one-tap choices; [] hides them. */
  quickPicks?: number[];
}) {
  const t = useT('careerOpportunities');
  const format = withTime ? formatDateTimeDigits : formatDateDigits;
  return (
    <View>
      <Input
        label={label}
        value={value}
        onChangeText={(text) => onChange(format(text))}
        placeholder={withTime ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD'}
        keyboardType="number-pad"
        maxLength={withTime ? 16 : 10}
        error={error}
        hint={hint ?? t('date_hint')}
        accessibilityLabel={label}
        rightIcon={
          value ? (
            <TouchableOpacity
              onPress={() => onChange('')}
              className="h-11 w-11 -me-3 items-center justify-center"
              accessibilityRole="button"
              accessibilityLabel={t('date_clear', { field: label })}
            >
              <Ionicons name="close-circle" size={18} color={colors.stone[400]} />
            </TouchableOpacity>
          ) : undefined
        }
      />
      {!withTime && quickPicks.length > 0 ? (
        <View className="flex-row flex-wrap -mt-2 mb-4">
          {quickPicks.map((days) => {
            const day = localDayFromToday(days);
            const text = days === 0 ? t('date_today') : t('date_in_days', { count: days });
            return (
              <Pressable
                key={days}
                onPress={() => onChange(day)}
                className={`min-h-[44px] px-3 me-2 mt-1 rounded-full border items-center justify-center ${value === day ? 'bg-brand-50 border-brand-500' : 'bg-white border-stone-200'}`}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${text}`}
                hitSlop={4}
              >
                <Text className="text-stone-700 text-xs">{text}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
