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
import { EducationItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { sectionTypeLabel } from '../../../lib/cv-editor';
import { colors } from '../../../theme/colors';
import { useStepSection } from '../useStepSection';
import { SectionSwitcher } from '../SectionSwitcher';
import { useT } from '../../../i18n';

/** Built per language so validation messages follow the app language. */
const makeSchema = (t: (key: string) => string) => z.object({
  institution: z.string().min(1, t('education.errors.institutionRequired')),
  degree: z.string().min(1, t('education.errors.degreeRequired')),
  field: z.string().min(1, t('education.errors.fieldRequired')),
  location: z.string().optional(),
  startDate: z.string().min(1, t('errors.startDateRequired')),
  endDate: z.string().optional(),
  gpa: z.string().optional(),
  description: z.string().optional(),
});

type FormData = z.infer<ReturnType<typeof makeSchema>>;

interface EducationStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function EducationStep({ onValidChange }: EducationStepProps) {
  const { sections, updateSection, addSection } = useCVStore();
  const t = useT('cvEditor');
  const tc = useT('common');
  const schema = useMemo(() => makeSchema(t), [t]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<EducationItem | null>(null);

  const { section: educationSection, sectionsForType, selectSection } = useStepSection(CVSectionType.EDUCATION);
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
        title: sectionTypeLabel(CVSectionType.EDUCATION),
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
    Alert.alert(t('education.deleteTitle'), t('education.deleteBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
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
        <Text className="text-lg font-semibold text-stone-900 mb-1">{t('education.title')}</Text>
        <Text className="text-stone-500 mb-5 text-sm">{t('education.subtitle')}</Text>
        <SectionSwitcher sections={sectionsForType} selected={educationSection} onSelect={selectSection} />

        {items.length === 0 ? (
          <View className="items-center py-10">
            <View className="w-16 h-16 rounded-full bg-stone-100 items-center justify-center mb-3">
              <Ionicons name="school-outline" size={28} color={colors.stone[400]} />
            </View>
            <Text className="text-stone-500 text-center mb-4">{t('education.empty')}</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} className="bg-surface border border-stone-100 rounded-xl p-4 mb-3 shadow-sm">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="font-bold text-stone-900">{t('education.degreeIn', { degree: item.degree, field: item.field })}</Text>
                  <Text className="text-stone-600 text-sm">{item.institution}</Text>
                  <Text className="text-stone-400 text-xs mt-1">
                    {item.startDate} — {item.endDate ?? t('entry.present')}
                  </Text>
                  {item.gpa && <Text className="text-stone-400 text-xs">{t('education.gpa', { gpa: item.gpa })}</Text>}
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
          {t('education.add')}
        </Button>

        <View className="h-8" />
      </ScrollView>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editingItem ? t('education.edit') : t('education.add')}
        size="lg"
      >
        <Controller
          control={control}
          name="institution"
          render={({ field }) => (
            <Input label={t('education.institution')} placeholder="MIT" value={field.value} onChangeText={field.onChange} error={errors.institution?.message} />
          )}
        />
        <Controller
          control={control}
          name="degree"
          render={({ field }) => (
            <Input label={t('education.degree')} placeholder={t('education.degreePlaceholder')} value={field.value} onChangeText={field.onChange} error={errors.degree?.message} />
          )}
        />
        <Controller
          control={control}
          name="field"
          render={({ field }) => (
            <Input label={t('education.field')} placeholder={t('education.fieldPlaceholder')} value={field.value} onChangeText={field.onChange} error={errors.field?.message} />
          )}
        />
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Controller
              control={control}
              name="startDate"
              render={({ field }) => (
                <Input label={t('fields.startDate')} placeholder={t('education.startPlaceholder')} value={field.value} onChangeText={field.onChange} error={errors.startDate?.message} />
              )}
            />
          </View>
          <View className="flex-1">
            <Controller
              control={control}
              name="endDate"
              render={({ field }) => (
                <Input label={t('fields.endDate')} placeholder={t('education.endPlaceholder')} value={field.value} onChangeText={field.onChange} />
              )}
            />
          </View>
        </View>
        <Controller
          control={control}
          name="gpa"
          render={({ field }) => (
            <Input label={t('education.gpaLabel')} placeholder="3.8/4.0" value={field.value} onChangeText={field.onChange} />
          )}
        />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>
          {editingItem ? t('entry.update') : t('education.add')}
        </Button>
      </Modal>
    </View>
  );
}
