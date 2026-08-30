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
import { CVSectionType, SkillLevel } from '../../../types/enums';
import { SkillItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { colors } from '../../../theme/colors';

const schema = z.object({
  name: z.string().min(1, 'Skill name is required'),
  level: z.nativeEnum(SkillLevel),
  category: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const SKILL_LEVELS = [
  { value: SkillLevel.BEGINNER, label: 'Beginner' },
  { value: SkillLevel.INTERMEDIATE, label: 'Intermediate' },
  { value: SkillLevel.ADVANCED, label: 'Advanced' },
  { value: SkillLevel.EXPERT, label: 'Expert' },
];

interface SkillsStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function SkillsStep({ onValidChange }: SkillsStepProps) {
  const { sections, updateSection, addSection } = useCVStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<SkillItem | null>(null);

  const skillsSection = sections.find((s) => s.type === CVSectionType.SKILLS);
  const items = (skillsSection?.items ?? []) as SkillItem[];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', level: SkillLevel.INTERMEDIATE, category: '' },
  });

  const openAdd = () => {
    reset({ name: '', level: SkillLevel.INTERMEDIATE, category: '' });
    setEditingItem(null);
    setModalVisible(true);
    onValidChange(true);
  };

  const openEdit = (item: SkillItem) => {
    reset({
      name: item.name,
      level: item.level,
      category: item.category ?? '',
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    // Spread first so web-only keys (order, …) survive; form fields overlay so clears win.
    const newItem: SkillItem = {
      ...(editingItem ?? {}),
      id: editingItem?.id ?? generateId(),
      name: data.name,
      level: data.level,
      category: data.category,
    };

    if (skillsSection) {
      const updatedItems = editingItem
        ? items.map((i) => (i.id === editingItem.id ? newItem : i))
        : [...items, newItem];
      updateSection(skillsSection.id, { items: updatedItems });
    } else {
      addSection({
        id: generateId(),
        type: CVSectionType.SKILLS,
        title: 'Skills',
        isVisible: true,
        order: sections.length,
        items: [newItem],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    setModalVisible(false);
  };

  const handleDelete = (itemId: string) => {
    Alert.alert('Delete Skill', 'Remove this skill?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (skillsSection) {
            updateSection(skillsSection.id, { items: items.filter((i) => i.id !== itemId) });
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        <Text className="text-lg font-semibold text-stone-900 mb-1">Skills</Text>
        <Text className="text-stone-500 mb-5 text-sm">
          Add your technical and soft skills with proficiency levels.
        </Text>

        {items.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mb-4">
            {items.map((item) => (
              <View
                key={item.id}
                className="flex-row items-center rounded-full px-3 py-1.5 border border-brand-600 bg-brand-50"
              >
                <Text className="text-sm font-medium text-brand-700">
                  {item.name}
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
        )}

        {items.length === 0 && (
          <View className="items-center py-8">
            <Ionicons name="code-slash-outline" size={36} color={colors.stone[400]} />
            <Text className="text-stone-500 text-center mt-2 mb-4">No skills added yet.</Text>
          </View>
        )}

        <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color={colors.stone[700]} />} fullWidth>
          Add Skill
        </Button>

        <View className="h-8" />
      </ScrollView>

      <Modal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingItem ? 'Edit Skill' : 'Add Skill'}>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input label="Skill Name *" placeholder="React Native" value={field.value} onChangeText={field.onChange} error={errors.name?.message} />
          )}
        />

        <Text className="text-sm font-medium text-stone-700 mb-2">Proficiency Level *</Text>
        <Controller
          control={control}
          name="level"
          render={({ field }) => (
            <View className="flex-row gap-2 mb-4 flex-wrap">
              {SKILL_LEVELS.map((level) => (
                <TouchableOpacity
                  key={level.value}
                  onPress={() => field.onChange(level.value)}
                  className={[
                    'px-3 py-2 rounded-xl border',
                    field.value === level.value
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-stone-200 bg-white',
                  ].join(' ')}
                >
                  <Text
                    className={[
                      'text-sm font-medium',
                      field.value === level.value ? 'text-brand-700' : 'text-stone-600',
                    ].join(' ')}
                  >
                    {level.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        />

        <Controller
          control={control}
          name="category"
          render={({ field }) => (
            <Input label="Category (optional)" placeholder="Frontend, Backend, Tools..." value={field.value} onChangeText={field.onChange} />
          )}
        />

        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>
          {editingItem ? 'Update' : 'Add Skill'}
        </Button>
      </Modal>
    </View>
  );
}
