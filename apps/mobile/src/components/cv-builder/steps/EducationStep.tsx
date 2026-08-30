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
import { EducationItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { colors } from '../../../theme/colors';

const schema = z.object({
  institution: z.string().min(1, 'Institution is required'),
  degree: z.string().min(1, 'Degree is required'),
  field: z.string().min(1, 'Field of study is required'),
  location: z.string().optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional(),
  gpa: z.string().optional(),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface EducationStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function EducationStep({ onValidChange }: EducationStepProps) {
  const { sections, updateSection, addSection } = useCVStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<EducationItem | null>(null);

  const educationSection = sections.find((s) => s.type === CVSectionType.EDUCATION);
  const items = (educationSection?.items ?? []) as EducationItem[];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      institution: '',
      degree: '',
      field: '',
      location: '',
      startDate: '',
      endDate: '',
      gpa: '',
      description: '',
    },
  });

  const openAdd = () => {
    reset({
      institution: '',
      degree: '',
      field: '',
      location: '',
      startDate: '',
      endDate: '',
      gpa: '',
      description: '',
    });
    setEditingItem(null);
    setModalVisible(true);
    onValidChange(true);
  };

  const openEdit = (item: EducationItem) => {
    reset({
      institution: item.institution,
      degree: item.degree,
      field: item.field,
      location: item.location ?? '',
      startDate: item.startDate,
      endDate: item.endDate ?? '',
      gpa: item.gpa ?? '',
      description: item.description ?? '',
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    const newItem: EducationItem = {
      ...(editingItem ?? {}),
      id: editingItem?.id ?? generateId(),
      institution: data.institution,
      degree: data.degree,
      field: data.field,
      location: data.location,
      startDate: data.startDate,
      endDate: data.endDate,
      gpa: data.gpa,
      description: data.description,
    };

    if (educationSection) {
      const updatedItems = editingItem
        ? items.map((i) => (i.id === editingItem.id ? newItem : i))
        : [...items, newItem];
      updateSection(educationSection.id, { items: updatedItems });
    } else {
      addSection({
        id: generateId(),
        type: CVSectionType.EDUCATION,
        title: 'Education',
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
    Alert.alert('Delete Education', 'Remove this education entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (educationSection) {
            updateSection(educationSection.id, {
              items: items.filter((i) => i.id !== itemId),
            });
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        <Text className="text-lg font-semibold text-stone-900 mb-1">Education</Text>
        <Text className="text-stone-500 mb-5 text-sm">
          Add your academic background and qualifications.
        </Text>

        {items.length === 0 ? (
          <View className="items-center py-10">
            <View className="w-16 h-16 rounded-full bg-stone-100 items-center justify-center mb-3">
              <Ionicons name="school-outline" size={28} color={colors.stone[400]} />
            </View>
            <Text className="text-stone-500 text-center mb-4">No education added yet.</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} className="bg-white border border-stone-100 rounded-xl p-4 mb-3 shadow-sm">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="font-bold text-stone-900">{item.degree} in {item.field}</Text>
                  <Text className="text-stone-600 text-sm">{item.institution}</Text>
                  <Text className="text-stone-400 text-xs mt-1">
                    {item.startDate} — {item.endDate ?? 'Present'}
                  </Text>
                  {item.gpa && <Text className="text-stone-400 text-xs">GPA: {item.gpa}</Text>}
                </View>
                <View className="flex-row gap-2 ml-2">
                  <TouchableOpacity onPress={() => openEdit(item)} className="p-1">
                    <Ionicons name="pencil-outline" size={18} color={colors.stone[500]} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(item.id)} className="p-1">
                    <Ionicons name="trash-outline" size={18} color={colors.error.DEFAULT} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}

        <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color={colors.stone[700]} />} fullWidth>
          Add Education
        </Button>

        <View className="h-8" />
      </ScrollView>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editingItem ? 'Edit Education' : 'Add Education'}
        size="lg"
      >
        <Controller
          control={control}
          name="institution"
          render={({ field }) => (
            <Input label="Institution *" placeholder="MIT" value={field.value} onChangeText={field.onChange} error={errors.institution?.message} />
          )}
        />
        <Controller
          control={control}
          name="degree"
          render={({ field }) => (
            <Input label="Degree *" placeholder="Bachelor of Science" value={field.value} onChangeText={field.onChange} error={errors.degree?.message} />
          )}
        />
        <Controller
          control={control}
          name="field"
          render={({ field }) => (
            <Input label="Field of Study *" placeholder="Computer Science" value={field.value} onChangeText={field.onChange} error={errors.field?.message} />
          )}
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Controller
              control={control}
              name="startDate"
              render={({ field }) => (
                <Input label="Start Date *" placeholder="Sep 2018" value={field.value} onChangeText={field.onChange} error={errors.startDate?.message} />
              )}
            />
          </View>
          <View className="flex-1">
            <Controller
              control={control}
              name="endDate"
              render={({ field }) => (
                <Input label="End Date" placeholder="May 2022" value={field.value} onChangeText={field.onChange} />
              )}
            />
          </View>
        </View>
        <Controller
          control={control}
          name="gpa"
          render={({ field }) => (
            <Input label="GPA (optional)" placeholder="3.8/4.0" value={field.value} onChangeText={field.onChange} />
          )}
        />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>
          {editingItem ? 'Update' : 'Add Education'}
        </Button>
      </Modal>
    </View>
  );
}
