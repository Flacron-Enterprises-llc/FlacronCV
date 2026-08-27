import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, FlatList, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useCVStore } from '../../../store/cv-store';
import { CVSectionType } from '../../../types/enums';
import { ExperienceItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';

const schema = z.object({
  company: z.string().min(1, 'Company name is required'),
  position: z.string().min(1, 'Job title is required'),
  location: z.string().optional(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional(),
  isCurrent: z.boolean(),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ExperienceStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function ExperienceStep({ onValidChange }: ExperienceStepProps) {
  const { sections, updateSection, addSection } = useCVStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ExperienceItem | null>(null);

  const experienceSection = sections.find((s) => s.type === CVSectionType.EXPERIENCE);
  const items = (experienceSection?.items ?? []) as ExperienceItem[];

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isCurrent: false },
  });

  const isCurrent = watch('isCurrent');

  const openAdd = () => {
    reset({ isCurrent: false });
    setEditingItem(null);
    setModalVisible(true);
    onValidChange(true); // experience is optional
  };

  const openEdit = (item: ExperienceItem) => {
    reset({
      company: item.company,
      position: item.position,
      location: item.location ?? '',
      startDate: item.startDate,
      endDate: item.endDate ?? '',
      isCurrent: item.isCurrent,
      description: item.description ?? '',
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    // Spread first so web-only keys (highlights, order, …) survive; form fields overlay so clears win.
    const newItem: ExperienceItem = {
      ...(editingItem ?? {}),
      id: editingItem?.id ?? generateId(),
      company: data.company,
      position: data.position,
      location: data.location,
      startDate: data.startDate,
      endDate: data.isCurrent ? undefined : data.endDate,
      isCurrent: data.isCurrent,
      description: data.description,
    };

    if (experienceSection) {
      const updatedItems = editingItem
        ? items.map((i) => (i.id === editingItem.id ? newItem : i))
        : [...items, newItem];
      updateSection(experienceSection.id, { items: updatedItems });
    } else {
      addSection({
        id: generateId(),
        type: CVSectionType.EXPERIENCE,
        title: 'Work Experience',
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
    Alert.alert('Delete Experience', 'Are you sure you want to remove this entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (experienceSection) {
            updateSection(experienceSection.id, {
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
        <Text className="text-lg font-bold text-stone-900 mb-1">Work Experience</Text>
        <Text className="text-stone-500 mb-5 text-sm">
          Add your work history, starting with the most recent position.
        </Text>

        {items.length === 0 ? (
          <View className="items-center py-10">
            <View className="w-16 h-16 rounded-full bg-stone-100 items-center justify-center mb-3">
              <Ionicons name="briefcase-outline" size={28} color="#a8a29e" />
            </View>
            <Text className="text-stone-500 text-center mb-4">
              No work experience added yet.
            </Text>
          </View>
        ) : (
          items.map((item) => (
            <View
              key={item.id}
              className="bg-white border border-stone-100 rounded-xl p-4 mb-3 shadow-sm"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="font-bold text-stone-900">{item.position}</Text>
                  <Text className="text-stone-600 text-sm">{item.company}</Text>
                  <Text className="text-stone-400 text-xs mt-1">
                    {item.startDate} — {item.isCurrent ? 'Present' : item.endDate}
                  </Text>
                  {item.location && (
                    <Text className="text-stone-400 text-xs">{item.location}</Text>
                  )}
                </View>
                <View className="flex-row gap-2 ml-2">
                  <TouchableOpacity onPress={() => openEdit(item)} className="p-1">
                    <Ionicons name="pencil-outline" size={18} color="#78716c" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(item.id)} className="p-1">
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}

        <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color="#374151" />} fullWidth>
          Add Experience
        </Button>

        <View className="h-8" />
      </ScrollView>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editingItem ? 'Edit Experience' : 'Add Experience'}
        size="lg"
      >
        <Controller
          control={control}
          name="position"
          render={({ field }) => (
            <Input
              label="Job Title *"
              placeholder="Senior Software Engineer"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.position?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="company"
          render={({ field }) => (
            <Input
              label="Company *"
              placeholder="Google"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.company?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="location"
          render={({ field }) => (
            <Input
              label="Location"
              placeholder="Mountain View, CA"
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Controller
              control={control}
              name="startDate"
              render={({ field }) => (
                <Input
                  label="Start Date *"
                  placeholder="Jan 2020"
                  value={field.value}
                  onChangeText={field.onChange}
                  error={errors.startDate?.message}
                />
              )}
            />
          </View>
          {!isCurrent && (
            <View className="flex-1">
              <Controller
                control={control}
                name="endDate"
                render={({ field }) => (
                  <Input
                    label="End Date"
                    placeholder="Dec 2023"
                    value={field.value}
                    onChangeText={field.onChange}
                  />
                )}
              />
            </View>
          )}
        </View>

        <Controller
          control={control}
          name="isCurrent"
          render={({ field }) => (
            <View className="flex-row items-center justify-between mb-4 p-3 bg-stone-50 rounded-xl">
              <Text className="text-stone-700 font-medium">Currently working here</Text>
              <Switch
                value={field.value}
                onValueChange={field.onChange}
                trackColor={{ true: '#f97316' }}
              />
            </View>
          )}
        />

        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Input
              label="Description"
              placeholder="Describe your responsibilities and achievements..."
              value={field.value}
              onChangeText={field.onChange}
              multiline
              numberOfLines={4}
              className="min-h-24"
            />
          )}
        />

        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>
          {editingItem ? 'Update' : 'Add Experience'}
        </Button>
      </Modal>
    </View>
  );
}
