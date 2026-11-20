import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
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
import { sectionTypeLabel } from '../../../lib/cv-editor';
import { colors } from '../../../theme/colors';
import { useStepSection } from '../useStepSection';
import { SectionSwitcher } from '../SectionSwitcher';
import { useT } from '../../../i18n';

/** Built per language so validation messages follow the app language. */
const makeSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t('projects.errors.nameRequired')),
  description: z.string().optional(),
  // Soft like Personal Info website — API stores a string, not a strict URL.
  url: z.string().optional().or(z.literal('')),
  technologies: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

type FormData = z.infer<ReturnType<typeof makeSchema>>;

interface ProjectsStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function ProjectsStep({ onValidChange }: ProjectsStepProps) {
  const { sections, updateSection, addSection } = useCVStore();
  const t = useT('cvEditor');
  const tc = useT('common');
  const schema = useMemo(() => makeSchema(t), [t]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectItem | null>(null);

  const { section: projectsSection, sectionsForType, selectSection } = useStepSection(CVSectionType.PROJECTS);
  const items = (projectsSection?.items ?? []) as ProjectItem[];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      description: '',
      url: '',
      technologies: '',
      startDate: '',
      endDate: '',
    },
  });

  const openAdd = () => {
    reset({
      name: '',
      description: '',
      url: '',
      technologies: '',
      startDate: '',
      endDate: '',
    });
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
      technologies: data.technologies?.split(',').map((tech) => tech.trim()).filter(Boolean),
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
        title: sectionTypeLabel(CVSectionType.PROJECTS),
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
    Alert.alert(t('projects.deleteTitle'), t('projects.deleteBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () => {
          if (projectsSection) {
            updateSection(projectsSection.id, { items: items.filter((i) => i.id !== itemId) });
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text className="text-lg font-semibold text-stone-900 mb-1">{t('projects.title')}</Text>
        <Text className="text-stone-500 mb-5 text-sm">{t('projects.subtitle')}</Text>
        <SectionSwitcher sections={sectionsForType} selected={projectsSection} onSelect={selectSection} />

        {items.length === 0 ? (
          <View className="items-center py-10">
            <View className="w-16 h-16 rounded-full bg-stone-100 items-center justify-center mb-3">
              <Ionicons name="construct-outline" size={28} color={colors.stone[400]} />
            </View>
            <Text className="text-stone-500 text-center mb-4">{t('projects.empty')}</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} className="bg-surface border border-stone-100 rounded-xl p-4 mb-3">
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
                <View className="flex-row gap-2 ms-2">
                  <TouchableOpacity onPress={() => openEdit(item)} className="p-1" accessibilityRole="button" accessibilityLabel={t('entry.edit')} hitSlop={12}>
                    <Ionicons name="pencil-outline" size={18} color={colors.stone[500]} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(item.id)} className="p-1" accessibilityRole="button" accessibilityLabel={t('entry.delete')} hitSlop={12}>
                    <Ionicons name="trash-outline" size={18} color={colors.error.DEFAULT} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))
        )}

        <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color={colors.stone[700]} />} fullWidth>
          {t('projects.add')}
        </Button>
        <View className="h-8" />
      </ScrollView>

      <Modal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingItem ? t('projects.edit') : t('projects.add')} size="lg">
        <Controller control={control} name="name" render={({ field }) => (
          <Input label={t('projects.name')} placeholder={t('projects.namePlaceholder')} value={field.value} onChangeText={field.onChange} error={errors.name?.message} />
        )} />
        <Controller control={control} name="description" render={({ field }) => (
          <Input label={t('fields.description')} placeholder={t('projects.descriptionPlaceholder')} value={field.value} onChangeText={field.onChange} multiline numberOfLines={3} />
        )} />
        <Controller control={control} name="technologies" render={({ field }) => (
          <Input label={t('projects.technologies')} placeholder="React Native, TypeScript, Firebase" value={field.value} onChangeText={field.onChange} />
        )} />
        <Controller control={control} name="url" render={({ field }) => (
          <Input label={t('projects.url')} placeholder="https://github.com/..." keyboardType="url" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={errors.url?.message} />
        )} />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>
          {editingItem ? t('entry.update') : t('projects.add')}
        </Button>
      </Modal>
    </View>
  );
}
