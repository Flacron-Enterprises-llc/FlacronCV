import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useT } from '../../../i18n';
import { colors } from '../../../theme/colors';

/**
 * Small building blocks shared by the action-pack, learning, scenario and
 * maintenance screens. No logic: the words come from the caller.
 */

/**
 * Spec section 21: before a paid run, the operation, the credits it needs and
 * the balance. `noneLeft` is shown (and the caller disables the run) when the
 * balance is 0.
 */
export function ChargeNotice({
  operation,
  required,
  balance,
  noneLeft,
  footnote,
}: {
  operation: string;
  required: string;
  balance: string;
  noneLeft?: string | null;
  footnote?: string;
}) {
  const t = useT('careerPlans.pack');
  return (
    <View className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-4" accessible accessibilityLabel={`${t('cost_heading')}. ${t('cost_operation_label')}: ${operation}. ${t('cost_required_label')}: ${required}. ${t('cost_balance_label')}: ${balance}.`}>
      <Text className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-2">{t('cost_heading')}</Text>
      <Row label={t('cost_operation_label')} value={operation} />
      <Row label={t('cost_required_label')} value={required} />
      <Row label={t('cost_balance_label')} value={balance} />
      {noneLeft ? <Text className="text-red-700 text-sm mt-2">{noneLeft}</Text> : null}
      {footnote ? <Text className="text-stone-500 text-xs mt-2 leading-4">{footnote}</Text> : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-1.5">
      <Text className="text-[11px] font-semibold text-stone-500 uppercase tracking-wide">{label}</Text>
      <Text className="text-sm text-stone-900">{value}</Text>
    </View>
  );
}

export interface ChoiceOption {
  value: string;
  label: string;
}

/**
 * A single choice that opens in place (no nested modal, so it works inside a
 * sheet). The current choice is shown on the closed row.
 */
export function Choice({
  label,
  value,
  options,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  options: ChoiceOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-stone-700 mb-1.5">{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        disabled={disabled}
        className={`border border-stone-200 rounded-xl px-4 min-h-[48px] flex-row items-center bg-surface ${disabled ? 'opacity-50' : ''}`}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? ''}`}
        accessibilityState={{ expanded: open, disabled }}
      >
        <Text className="flex-1 text-base text-stone-900 me-2" numberOfLines={2}>
          {current?.label ?? ''}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.stone[500]} />
      </TouchableOpacity>
      {open ? (
        <View className="border border-stone-200 rounded-xl mt-1 bg-surface overflow-hidden" accessibilityRole="radiogroup">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <TouchableOpacity
                key={option.value || '__none'}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`px-4 min-h-[44px] flex-row items-center border-b border-stone-100 ${selected ? 'bg-brand-50' : ''}`}
                accessibilityRole="radio"
                accessibilityState={{ selected, checked: selected }}
                accessibilityLabel={option.label}
              >
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? colors.brand[600] : colors.stone[400]} />
                <Text className="flex-1 ms-3 text-sm text-stone-900 py-2">{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {hint ? <Text className="text-xs text-stone-500 mt-1">{hint}</Text> : null}
    </View>
  );
}

/** A checkbox row with a 44 pt target. */
export function CheckRow({ label, checked, onToggle, disabled }: { label: string; checked: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={disabled}
      className="flex-row items-center min-h-[44px] py-1"
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      activeOpacity={0.7}
    >
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? colors.brand[600] : colors.stone[400]} />
      <Text className="flex-1 ms-3 text-sm text-stone-800">{label}</Text>
    </TouchableOpacity>
  );
}

export function Note({ tone, text, children }: { tone: 'success' | 'error' | 'info'; text: string; children?: React.ReactNode }) {
  const box = tone === 'success' ? 'bg-success-bg' : tone === 'error' ? 'bg-red-50' : 'bg-stone-100';
  const fg = tone === 'success' ? 'text-success' : tone === 'error' ? 'text-red-700' : 'text-stone-700';
  return (
    <View className={`${box} rounded-xl p-3 mb-4`} accessibilityLiveRegion="polite" accessibilityRole={tone === 'error' ? 'alert' : undefined}>
      <Text className={`${fg} text-sm leading-5`}>{text}</Text>
      {children}
    </View>
  );
}
