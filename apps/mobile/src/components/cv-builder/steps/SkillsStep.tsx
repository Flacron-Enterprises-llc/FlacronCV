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
import { CVSectionType, SkillLevel } from '../../../types/enums';
import { SkillItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { sectionTypeLabel } from '../../../lib/cv-editor';
import { colors } from '../../../theme/colors';
import { useStepSection } from '../useStepSection';
import { SectionSwitcher } from '../SectionSwitcher';
import { useT } from '../../../i18n';

/** Built per language so validation messages follow the app language. */
const makeSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t('skills.errors.nameRequired')),
  level: z.nativeEnum(SkillLevel),
  category: z.string().optional(),
});

type FormData = z.infer<ReturnType<typeof makeSchema>>;

interface SkillsStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function SkillsStep({ onValidChange }: SkillsStepProps) {
  const { sections, updateSection, addSection } = useCVStore();
  const t = useT('cvEditor');
  const tc = useT('common');
  const schema = useMemo(() => makeSchema(t), [t]);
  const SKILL_LEVELS = [
    { value: SkillLevel.BEGINNER, label: t('skills.levels.beginner') },
    { value: SkillLevel.INTERMEDIATE, label: t('skills.levels.intermediate') },
    { value: SkillLevel.ADVANCED, label: t('skills.levels.advanced') },
    { value: SkillLevel.EXPERT, label: t('skills.levels.expert') },
  ];
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<SkillItem | null>(null);

  const { section: skillsSection, sectionsForType, selectSection } = useStepSection(CVSectionType.SKILLS);
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
        title: sectionTypeLabel(CVSectionType.SKILLS),
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
    Alert.alert(t('skills.deleteTitle'), t('skills.deleteBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
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
        <Text className="text-lg font-semibold text-stone-900 mb-1">{t('skills.title')}</Text>
        <Text className="text-stone-500 mb-5 text-sm">{t('skills.subtitle')}</Text>
        <SectionSwitcher sections={sectionsForType} selected={skillsSection} onSelect={selectSection} />

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
                <TouchableOpacity onPress={() => openEdit(item)} className="ms-1.5 p-0.5" accessibilityRole="button" accessibilityLabel={t('entry.edit')} hitSlop={12}>
                  <Ionicons name="pencil-outline" size={14} color={colors.stone[500]} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)} className="ms-0.5" accessibilityRole="button" accessibilityLabel={t('entry.delete')} hitSlop={12}>
                  <Ionicons name="close-circle" size={14} color={colors.error.DEFAULT} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {items.length === 0 && (
          <View className="items-center py-8">
            <Ionicons name="code-slash-outline" size={36} color={colors.stone[400]} />
            <Text className="text-stone-500 text-center mt-2 mb-4">{t('skills.empty')}</Text>
          </View>
        )}

        <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color={colors.stone[700]} />} fullWidth>
          {t('skills.add')}
        </Button>

        <View className="h-8" />
      </ScrollView>

      <Modal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingItem ? t('skills.edit') : t('skills.add')}>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <Input label={t('skills.name')} placeholder="React Native" value={field.value} onChangeText={field.onChange} error={errors.name?.message} />
          )}
        />

        <Text className="text-sm font-medium text-stone-700 mb-2">{t('fields.proficiency')}</Text>
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
                      : 'border-stone-200 bg-surface',
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
            <Input label={t('skills.category')} placeholder={t('skills.categoryPlaceholder')} value={field.value} onChangeText={field.onChange} />
          )}
        />

        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>
          {editingItem ? t('entry.update') : t('skills.add')}
        </Button>
      </Modal>
    </View>
  );
}
