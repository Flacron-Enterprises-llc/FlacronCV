import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { CVSection } from '../../types/cv.types';
import { colors } from '../../theme/colors';
import { useT } from '../../i18n';

interface SectionSwitcherProps {
  sections: CVSection[];
  selected: CVSection | undefined;
  onSelect: (id: string) => void;
}

/**
 * Chips to pick which section of this type the step edits (only shown when
 * there is more than one), plus a note when the edited section is hidden.
 */
export function SectionSwitcher({ sections, selected, onSelect }: SectionSwitcherProps) {
  const t = useT('cvEditor');
  return (
    <View>
      {sections.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3"
          contentContainerStyle={{ gap: 8 }}
          accessibilityRole="tablist"
        >
          {sections.map((s) => {
            const active = s.id === selected?.id;
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => onSelect(s.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t('sections.editA11y', { title: s.title })}
                className={[
                  'px-4 rounded-full border justify-center',
                  active ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-surface',
                ].join(' ')}
                style={{ minHeight: 44 }}
              >
                <Text
                  className={active ? 'text-brand-700 font-semibold' : 'text-stone-600'}
                  numberOfLines={1}
                >
                  {s.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
      {selected && !selected.isVisible && (
        <View className="flex-row items-center bg-stone-100 rounded-xl px-3 py-2 mb-3">
          <Ionicons name="eye-off-outline" size={16} color={colors.stone[500]} />
          <Text className="text-stone-600 text-xs ms-2 flex-1">{t('sections.hiddenNote')}</Text>
        </View>
      )}
    </View>
  );
}
