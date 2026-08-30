import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useCVStore } from '../../../store/cv-store';
import { CVSectionType } from '../../../types/enums';
import { LanguageItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { colors } from '../../../theme/colors';

const PROFICIENCY_LEVELS = ['Native', 'Fluent', 'Advanced', 'Intermediate', 'Basic'];

const schema = z.object({
  name: z.string().min(1, 'Language name is required'),
  proficiency: z.string().min(1, 'Proficiency level is required'),
});

type FormData = z.infer<typeof schema>;

export function LanguagesStep({ onValidChange }: { onValidChange: (v: boolean) => void }) {
  const { sections, updateSection, addSection } = useCVStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<LanguageItem | null>(null);
  const langSection = sections.find((s) => s.type === CVSectionType.LANGUAGES);
  const items = (langSection?.items ?? []) as LanguageItem[];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { proficiency: 'Fluent' },
  });

  const openAdd = () => {
    reset({ proficiency: 'Fluent' });
    setEditingItem(null);
    setModalVisible(true);
    onValidChange(true);
  };

  const openEdit = (item: LanguageItem) => {
    reset({
      name: item.name,
      proficiency: item.proficiency,
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    // Spread first so web-only keys (order, description, …) survive; form fields overlay so clears win.
    const newItem: LanguageItem = {
      ...(editingItem ?? {}),
      id: editingItem?.id ?? generateId(),
      name: data.name,
      proficiency: data.proficiency,
    };
    if (langSection) {
      const updatedItems = editingItem
        ? items.map((i) => (i.id === editingItem.id ? newItem : i))
        : [...items, newItem];
      updateSection(langSection.id, { items: updatedItems });
    } else {
      addSection({
        id: generateId(), type: CVSectionType.LANGUAGES, title: 'Languages',
        isVisible: true, order: sections.length, items: [newItem],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    setModalVisible(false);
  };

  const handleDelete = (itemId: string) => {
    if (langSection) {
      updateSection(langSection.id, { items: items.filter((i) => i.id !== itemId) });
    }
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5">
        <Text className="text-lg font-semibold text-stone-900 mb-1">Languages</Text>
        <Text className="text-stone-500 mb-5 text-sm">List the languages you speak and your proficiency levels.</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {items.map((item) => (
            <View
              key={item.id}
              className="flex-row items-center rounded-full px-3 py-1.5 border border-brand-600 bg-brand-50"
            >
              <Text className="text-sm font-medium text-brand-700">
                {item.name} · {item.proficiency}
              </Text>
              <TouchableOpacity onPress={() => openEdit(item)} className="ml-1.5 p-0.5">
                <Ionicons name="pencil-outline" size={14} color={colors.stone[500]} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item.id)} className="ml-0.5">
                <Ionicons name="close-circle" size={14} color={colors.error.DEFAULT} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
        <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color={colors.stone[700]} />} fullWidth>
          Add Language
        </Button>
        <View className="h-8" />
      </ScrollView>
      <Modal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingItem ? 'Edit Language' : 'Add Language'}>
        <Controller control={control} name="name" render={({ field }) => (
          <Input label="Language *" placeholder="English" value={field.value} onChangeText={field.onChange} error={errors.name?.message} />
        )} />
        <Text className="text-sm font-medium text-stone-700 mb-2">Proficiency Level *</Text>
        <Controller control={control} name="proficiency" render={({ field }) => (
          <View className="flex-row flex-wrap gap-2 mb-4">
            {PROFICIENCY_LEVELS.map((level) => (
              <TouchableOpacity
                key={level}
                onPress={() => field.onChange(level)}
                className={[
                  'px-3 py-2 rounded-xl border',
                  field.value === level
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-stone-200 bg-white',
                ].join(' ')}
              >
                <Text className={field.value === level ? 'text-brand-700 font-semibold' : 'text-stone-600'}>
                  {level}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )} />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>{editingItem ? 'Update' : 'Add Language'}</Button>
      </Modal>
    </View>
  );
}
