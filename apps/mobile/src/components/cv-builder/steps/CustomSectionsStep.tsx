import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useCVStore } from '../../../store/cv-store';
import { CVSectionType } from '../../../types/enums';
import { CustomItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import {
  appendOrder,
  buildCustomItem,
  buildNewSection,
  customItemTitle,
  nonStandardSections,
  sectionTypeLabel,
} from '../../../lib/cv-editor';
import { colors } from '../../../theme/colors';
import { SectionSwitcher } from '../SectionSwitcher';
import { SectionTitleModal } from '../SectionTitleModal';

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  subtitle: z.string().optional(),
  date: z.string().optional(),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const EMPTY: FormData = { title: '', subtitle: '', date: '', description: '' };

/**
 * Custom sections (CVSectionType.CUSTOM) — and awards / publications /
 * volunteer sections created elsewhere, which the web edits with the same
 * generic title + description form. Custom entries also get subtitle + date,
 * same fields as the web editor.
 */
export function CustomSectionsStep({ onValidChange }: { onValidChange: (v: boolean) => void }) {
  const { sections, updateSection, addSection } = useCVStore();
  const customSections = nonStandardSections(sections);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const section = customSections.find((s) => s.id === selectedId) ?? customSections[0];
  const items = (section?.items ?? []) as CustomItem[];
  const isCustom = section?.type === CVSectionType.CUSTOM;

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<CustomItem | null>(null);
  const [naming, setNaming] = useState(false);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY,
  });

  const addCustomSection = (title: string) => {
    const now = new Date().toISOString();
    const created = buildNewSection(generateId(), CVSectionType.CUSTOM, title, appendOrder(sections), now);
    addSection(created);
    setSelectedId(created.id);
    setNaming(false);
    onValidChange(true);
  };

  const openAdd = () => {
    reset(EMPTY);
    setEditingItem(null);
    setModalVisible(true);
  };

  const openEdit = (item: CustomItem) => {
    reset({
      title: customItemTitle(item),
      subtitle: item.subtitle ?? '',
      date: item.date ?? '',
      description: item.description ?? '',
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    if (!section) return;
    const newItem = buildCustomItem(editingItem?.id ?? generateId(), section.type, editingItem, data);
    const updatedItems = editingItem
      ? items.map((i) => (i.id === editingItem.id ? newItem : i))
      : [...items, newItem];
    updateSection(section.id, { items: updatedItems });
    setModalVisible(false);
  };

  const handleDelete = (itemId: string) => {
    Alert.alert('Delete Entry', 'Remove this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (section) updateSection(section.id, { items: items.filter((i) => i.id !== itemId) });
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
        <Text className="text-lg font-semibold text-stone-900 mb-1">Custom Sections</Text>
        <Text className="text-stone-500 mb-5 text-sm">
          Add anything else you want on your CV — awards, volunteering, publications, interests.
        </Text>

        {customSections.length === 0 ? (
          <View className="items-center py-10">
            <View className="w-16 h-16 rounded-full bg-stone-100 items-center justify-center mb-3">
              <Ionicons name="albums-outline" size={28} color={colors.stone[400]} />
            </View>
            <Text className="text-stone-500 text-center mb-4">No custom sections yet.</Text>
          </View>
        ) : (
          <>
            <SectionSwitcher sections={customSections} selected={section} onSelect={setSelectedId} />
            {section && (
              <Text className="text-xs font-semibold text-stone-400 uppercase mb-2">
                {section.title}{isCustom ? '' : ` · ${sectionTypeLabel(section.type)}`}
              </Text>
            )}
            {items.length === 0 ? (
              <Text className="text-stone-400 text-center text-sm border border-dashed border-stone-200 rounded-xl py-4 mb-3">
                No entries yet — add your first one below.
              </Text>
            ) : (
              items.map((item) => (
                <View key={item.id} className="bg-white border border-stone-100 rounded-xl p-4 mb-3">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1">
                      <Text className="font-bold text-stone-900">{customItemTitle(item) || 'Untitled entry'}</Text>
                      {isCustom && item.subtitle ? <Text className="text-stone-500 text-sm">{item.subtitle}</Text> : null}
                      {isCustom && item.date ? <Text className="text-stone-400 text-xs mt-1">{item.date}</Text> : null}
                      {item.description ? (
                        <Text className="text-stone-500 text-xs mt-1" numberOfLines={2}>{item.description}</Text>
                      ) : null}
                    </View>
                    <View className="flex-row gap-2 ml-2">
                      <TouchableOpacity onPress={() => openEdit(item)} className="p-1" accessibilityRole="button" accessibilityLabel="Edit entry" hitSlop={12}>
                        <Ionicons name="pencil-outline" size={18} color={colors.stone[500]} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(item.id)} className="p-1" accessibilityRole="button" accessibilityLabel="Delete entry" hitSlop={12}>
                        <Ionicons name="trash-outline" size={18} color={colors.error.DEFAULT} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))
            )}
            {section && (
              <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color={colors.stone[700]} />} fullWidth>
                Add item
              </Button>
            )}
          </>
        )}

        <View className="h-3" />
        <Button
          variant={customSections.length === 0 ? 'outline' : 'ghost'}
          onPress={() => setNaming(true)}
          icon={<Ionicons name="albums-outline" size={18} color={colors.stone[700]} />}
          fullWidth
        >
          Add Custom Section
        </Button>
        <View className="h-8" />
      </ScrollView>

      <SectionTitleModal
        visible={naming}
        heading="New Custom Section"
        initialTitle="Custom Section"
        confirmLabel="Add Section"
        onClose={() => setNaming(false)}
        onSubmit={addCustomSection}
      />

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editingItem ? 'Edit Entry' : 'Add Entry'}
        size="lg"
      >
        <Controller control={control} name="title" render={({ field }) => (
          <Input label="Title *" value={field.value} onChangeText={field.onChange} error={errors.title?.message} />
        )} />
        {isCustom && (
          <>
            <Controller control={control} name="subtitle" render={({ field }) => (
              <Input label="Subtitle" value={field.value} onChangeText={field.onChange} />
            )} />
            <Controller control={control} name="date" render={({ field }) => (
              <Input label="Date" placeholder="2023-01" value={field.value} onChangeText={field.onChange} />
            )} />
          </>
        )}
        <Controller control={control} name="description" render={({ field }) => (
          <Input
            label="Description"
            placeholder="Description…"
            value={field.value}
            onChangeText={field.onChange}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            className="min-h-24"
          />
        )} />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>
          {editingItem ? 'Update' : 'Add Entry'}
        </Button>
      </Modal>
    </View>
  );
}
