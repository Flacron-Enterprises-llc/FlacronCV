import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { CVSection } from '../../types/cv.types';
import { colors } from '../../theme/colors';

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
                accessibilityLabel={`Edit section ${s.title}`}
                className={[
                  'px-4 rounded-full border justify-center',
                  active ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white',
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
          <Text className="text-stone-600 text-xs ml-2 flex-1">
            This section is hidden on your CV. Show it again in the Arrange Sections step.
          </Text>
        </View>
      )}
    </View>
  );
}
