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
import { ProjectItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { colors } from '../../../theme/colors';

const schema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional(),
  url: z.string().url('Invalid URL').optional().or(z.literal('')),
  technologies: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ProjectsStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function ProjectsStep({ onValidChange }: ProjectsStepProps) {
  const { sections, updateSection, addSection } = useCVStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectItem | null>(null);

  const projectsSection = sections.find((s) => s.type === CVSectionType.PROJECTS);
  const items = (projectsSection?.items ?? []) as ProjectItem[];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const openAdd = () => {
    reset({});
    setEditingItem(null);
    setModalVisible(true);
    onValidChange(true);
  };

  const openEdit = (item: ProjectItem) => {
    reset({
      name: item.name,
      description: item.description ?? '',
      url: item.url ?? '',
      technologies: item.technologies?.join(', ') ?? '',
      startDate: item.startDate ?? '',
      endDate: item.endDate ?? '',
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    const newItem: ProjectItem = {
      ...(editingItem ?? {}),
      id: editingItem?.id ?? generateId(),
      name: data.name,
      description: data.description,
      url: data.url || undefined,
      technologies: data.technologies?.split(',').map((t) => t.trim()).filter(Boolean),
      startDate: data.startDate,
      endDate: data.endDate,
    };

    if (projectsSection) {
      const updatedItems = editingItem
        ? items.map((i) => (i.id === editingItem.id ? newItem : i))
        : [...items, newItem];
      updateSection(projectsSection.id, { items: updatedItems });
    } else {
      addSection({
        id: generateId(),
        type: CVSectionType.PROJECTS,
        title: 'Projects',
        isVisible: true,
        order: sections.length,
        items: [newItem],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    setModalVisible(false);
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        <Text className="text-lg font-semibold text-stone-900 mb-1">Projects</Text>
        <Text className="text-stone-500 mb-5 text-sm">
          Showcase your notable projects and side work.
        </Text>

        {items.map((item) => (
          <View key={item.id} className="bg-white border border-stone-100 rounded-xl p-4 mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="font-bold text-stone-900">{item.name}</Text>
                {item.description && (
                  <Text className="text-stone-500 text-sm mt-1" numberOfLines={2}>{item.description}</Text>
                )}
                {item.technologies && item.technologies.length > 0 && (
                  <View className="flex-row flex-wrap gap-1 mt-2">
                    {item.technologies.map((tech, i) => (
                      <View key={i} className="bg-stone-100 px-2 py-0.5 rounded">
                        <Text className="text-stone-600 text-xs">{tech}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
              <View className="flex-row gap-2 ml-2">
                <TouchableOpacity onPress={() => openEdit(item)} className="p-1">
                  <Ionicons name="pencil-outline" size={18} color={colors.stone[500]} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (projectsSection) {
                      updateSection(projectsSection.id, { items: items.filter((i) => i.id !== item.id) });
                    }
                  }}
                  className="p-1"
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error.DEFAULT} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ))}

        <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color={colors.stone[700]} />} fullWidth>
          Add Project
        </Button>
        <View className="h-8" />
      </ScrollView>

      <Modal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingItem ? 'Edit Project' : 'Add Project'} size="lg">
        <Controller control={control} name="name" render={({ field }) => (
          <Input label="Project Name *" placeholder="My Awesome App" value={field.value} onChangeText={field.onChange} error={errors.name?.message} />
        )} />
        <Controller control={control} name="description" render={({ field }) => (
          <Input label="Description" placeholder="A brief description of what you built..." value={field.value} onChangeText={field.onChange} multiline numberOfLines={3} />
        )} />
        <Controller control={control} name="technologies" render={({ field }) => (
          <Input label="Technologies (comma-separated)" placeholder="React Native, TypeScript, Firebase" value={field.value} onChangeText={field.onChange} />
        )} />
        <Controller control={control} name="url" render={({ field }) => (
          <Input label="Project URL" placeholder="https://github.com/..." keyboardType="url" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={errors.url?.message} />
        )} />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>
          {editingItem ? 'Update' : 'Add Project'}
        </Button>
      </Modal>
    </View>
  );
}
