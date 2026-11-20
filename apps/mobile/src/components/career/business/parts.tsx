import React from 'react';
import { Share, Switch, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../../theme/colors';

/** Building blocks shared by the Business and Developer screens. */

export function Section({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <View className="bg-surface rounded-2xl border border-stone-100 p-4 mb-4">
      <Text className="text-base font-bold text-stone-900" accessibilityRole="header">
        {title}
      </Text>
      {help ? <Text className="text-stone-500 text-sm mt-1 leading-5">{help}</Text> : null}
      {children}
    </View>
  );
}

export type NoteTone = 'success' | 'error' | 'info';
export interface Note {
  tone: NoteTone;
  text: string;
}

export function NoteView({ note }: { note: Note | null }) {
  if (!note) return null;
  const box = { success: 'bg-success-bg border-green-200', error: 'bg-red-50 border-red-200', info: 'bg-stone-100 border-stone-200' }[note.tone];
  const fg = { success: 'text-success', error: 'text-red-700', info: 'text-stone-700' }[note.tone];
  return (
    <View
      className={`rounded-xl border p-3 mt-3 ${box}`}
      accessibilityRole={note.tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      <Text className={`text-sm leading-5 ${fg}`}>{note.text}</Text>
    </View>
  );
}

export function Tag({ label, tone = 'default' }: { label: string; tone?: 'default' | 'success' | 'muted' }) {
  const bg = { default: 'bg-brand-100', success: 'bg-success-bg', muted: 'bg-stone-100' }[tone];
  const fg = { default: 'text-brand-700', success: 'text-success', muted: 'text-stone-600' }[tone];
  return (
    <View className={`${bg} rounded-full px-2.5 py-0.5`}>
      <Text className={`${fg} text-[11px] font-bold`}>{label}</Text>
    </View>
  );
}

/** A wrapping row of choices (a select on the website). */
export function ChipPicker<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | '';
  options: readonly { value: T | ''; label: string }[];
  onChange: (value: T | '') => void;
  disabled?: boolean;
}) {
  return (
    <View className="mb-3">
      <Text className="text-sm font-medium text-stone-700 mb-1.5">{label}</Text>
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <TouchableOpacity
              key={option.value || '_none'}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              className={`rounded-full px-3 min-h-[44px] justify-center border ${selected ? 'bg-brand-600 border-brand-600' : 'bg-surface border-stone-200'} ${disabled ? 'opacity-50' : ''}`}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={option.label}
            >
              <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-stone-800'}`} numberOfLines={1} style={{ maxWidth: 260 }}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function SwitchRow({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <View className="flex-row items-center justify-between min-h-[44px] my-1">
      <Text className="text-stone-800 text-sm flex-1 me-3 leading-5">{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        trackColor={{ true: colors.brand[600], false: colors.stone[300] }}
      />
    </View>
  );
}

/** Opens the system share sheet with a text (the app has no clipboard module; "Copy" is in the sheet). */
export async function shareText(text: string): Promise<void> {
  try {
    await Share.share({ message: text });
  } catch {
    // The person closed the sheet or sharing is unavailable; the text stays on screen and is selectable.
  }
}
