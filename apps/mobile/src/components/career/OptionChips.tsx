import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { colors } from '../../theme/colors';

/**
 * A labelled single-choice group drawn as wrapping chips (the phone version
 * of the website's <select>). Each chip is a 44 pt radio with its state
 * announced; the selected chip also shows a check, so colour is never the
 * only signal.
 */
export function OptionChips({
  label,
  hint,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-stone-700 mb-1.5">{label}</Text>
      <View className="flex-row flex-wrap" accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value || '__any'}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              accessibilityLabel={option.label}
              className={`min-h-[44px] flex-row items-center px-3 me-2 mb-2 rounded-full border ${
                selected ? 'bg-brand-50 border-brand-500' : 'bg-surface border-stone-200'
              } ${disabled ? 'opacity-50' : ''}`}
            >
              {selected ? <Ionicons name="checkmark" size={14} color={colors.brand[700]} style={{ marginEnd: 4 }} /> : null}
              <Text className={`text-sm ${selected ? 'text-brand-700 font-semibold' : 'text-stone-700'}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text className="text-stone-400 text-xs leading-4">{hint}</Text> : null}
    </View>
  );
}

/** A labelled on/off row with a 44 pt target. */
export function ToggleField({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (value: boolean) => void; hint?: string }) {
  return (
    <View className="mb-3">
      <View className="flex-row items-center justify-between min-h-[44px]">
        <Text className="text-stone-800 text-sm flex-1 me-3">{label}</Text>
        <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brand[600], false: colors.stone[300] }} accessibilityLabel={label} />
      </View>
      {hint ? <Text className="text-stone-400 text-xs leading-4">{hint}</Text> : null}
    </View>
  );
}
