import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useCVStore } from '../../../store/cv-store';
import { CVSection } from '../../../types/cv.types';
import { CVSectionType } from '../../../types/enums';
import { generateId } from '../../../lib/utils';
import {
  ADDABLE_SECTION_TYPES,
  appendOrder,
  buildNewSection,
  sectionTypeLabel,
} from '../../../lib/cv-editor';
import { colors } from '../../../theme/colors';
import { SectionTitleModal } from '../SectionTitleModal';

interface IconButtonProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  selected?: boolean;
}

function IconButton({ icon, label, onPress, disabled, color, selected }: IconButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, ...(selected !== undefined ? { selected } : {}) }}
      className={['items-center justify-center rounded-xl bg-stone-50', disabled ? 'opacity-30' : ''].join(' ')}
      style={{ width: 44, height: 44 }}
    >
      <Ionicons name={icon} size={20} color={color ?? colors.stone[700]} />
    </TouchableOpacity>
  );
}

/**
 * Order, visibility, titles and add/remove for every section — the website's
 * section list (drag handle, eye toggle, title field, trash, Add Section),
 * with up/down buttons instead of drag. Saved with Continue/Finish:
 * PUT /cvs/:id { sectionOrder } plus each section's { order, isVisible, title }.
 */
export function ArrangeSectionsStep({ onValidChange }: { onValidChange: (v: boolean) => void }) {
  const { sections, moveSection, updateSection, removeSection, addSection } = useCVStore();
  const [renaming, setRenaming] = useState<CVSection | null>(null);
  const [picking, setPicking] = useState(false);
  const [namingCustom, setNamingCustom] = useState(false);

  const add = (type: CVSectionType, title: string) => {
    addSection(buildNewSection(generateId(), type, title, appendOrder(sections), new Date().toISOString()));
    onValidChange(true);
  };

  const onPickType = (type: CVSectionType, label: string) => {
    setPicking(false);
    if (type === CVSectionType.CUSTOM) {
      // iOS will not present a second Modal while the first is still sliding out.
      setTimeout(() => setNamingCustom(true), 400);
      return;
    }
    add(type, label);
  };

  const confirmRemove = (section: CVSection) => {
    const n = section.items.length;
    Alert.alert(
      'Remove Section',
      n > 0
        ? `Remove “${section.title}” and its ${n} ${n === 1 ? 'entry' : 'entries'} from this CV?`
        : `Remove “${section.title}” from this CV?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeSection(section.id) },
      ],
    );
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
        <Text className="text-lg font-semibold text-stone-900 mb-1">Arrange Sections</Text>
        <Text className="text-stone-500 mb-5 text-sm">
          Change the order of the sections on your CV, rename them, and choose which ones to show.
          Hidden sections stay saved but are left out of your CV.
        </Text>

        {sections.length === 0 ? (
          <Text className="text-stone-400 text-center text-sm border border-dashed border-stone-200 rounded-xl py-6 mb-3">
            No sections yet. Add one below.
          </Text>
        ) : (
          sections.map((section, index) => {
            const n = section.items.length;
            return (
              <View
                key={section.id}
                className={[
                  'bg-white border rounded-2xl p-3 mb-3',
                  section.isVisible ? 'border-stone-100' : 'border-dashed border-stone-300',
                ].join(' ')}
              >
                <View className="flex-row items-center mb-2">
                  <Text className="text-xs font-bold text-stone-400 w-6">{index + 1}</Text>
                  <View className="flex-1">
                    <Text
                      className={section.isVisible ? 'font-bold text-stone-900' : 'font-bold text-stone-400'}
                      numberOfLines={1}
                    >
                      {section.title}
                    </Text>
                    <Text className="text-xs text-stone-400">
                      {sectionTypeLabel(section.type)} · {n} {n === 1 ? 'item' : 'items'}
                      {section.isVisible ? '' : ' · Hidden'}
                    </Text>
                  </View>
                </View>
                <View className="flex-row justify-between">
                  <View className="flex-row gap-2">
                    <IconButton
                      icon="arrow-up"
                      label={`Move ${section.title} up`}
                      disabled={index === 0}
                      onPress={() => moveSection(section.id, -1)}
                    />
                    <IconButton
                      icon="arrow-down"
                      label={`Move ${section.title} down`}
                      disabled={index === sections.length - 1}
                      onPress={() => moveSection(section.id, 1)}
                    />
                  </View>
                  <View className="flex-row gap-2">
                    <IconButton
                      icon={section.isVisible ? 'eye-outline' : 'eye-off-outline'}
                      label={section.isVisible ? `Hide section ${section.title}` : `Show section ${section.title}`}
                      selected={section.isVisible}
                      onPress={() => updateSection(section.id, { isVisible: !section.isVisible })}
                    />
                    <IconButton
                      icon="pencil-outline"
                      label={`Rename section ${section.title}`}
                      onPress={() => setRenaming(section)}
                    />
                    <IconButton
                      icon="trash-outline"
                      label={`Remove section ${section.title}`}
                      color={colors.error.DEFAULT}
                      onPress={() => confirmRemove(section)}
                    />
                  </View>
                </View>
              </View>
            );
          })
        )}

        <Button
          variant="outline"
          onPress={() => setPicking(true)}
          icon={<Ionicons name="add" size={18} color={colors.stone[700]} />}
          fullWidth
        >
          Add Section
        </Button>
        <View className="h-8" />
      </ScrollView>

      <Modal visible={picking} onClose={() => setPicking(false)} title="Add Section">
        {ADDABLE_SECTION_TYPES.map(({ type, label }) => (
          <TouchableOpacity
            key={type}
            onPress={() => onPickType(type, label)}
            accessibilityRole="button"
            className="flex-row items-center justify-between px-4 rounded-xl border border-stone-200 mb-2"
            style={{ minHeight: 48 }}
          >
            <Text className="text-stone-800 font-medium">{label}</Text>
            <Ionicons name="add" size={18} color={colors.stone[500]} />
          </TouchableOpacity>
        ))}
      </Modal>

      <SectionTitleModal
        visible={renaming !== null}
        heading="Rename Section"
        initialTitle={renaming?.title ?? ''}
        confirmLabel="Save"
        onClose={() => setRenaming(null)}
        onSubmit={(title) => {
          if (renaming) updateSection(renaming.id, { title });
          setRenaming(null);
        }}
      />

      <SectionTitleModal
        visible={namingCustom}
        heading="New Custom Section"
        initialTitle="Custom Section"
        confirmLabel="Add Section"
        onClose={() => setNamingCustom(false)}
        onSubmit={(title) => {
          add(CVSectionType.CUSTOM, title);
          setNamingCustom(false);
        }}
      />
    </View>
  );
}
