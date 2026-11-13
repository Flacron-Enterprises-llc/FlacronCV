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
import { LanguageItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { sectionTypeLabel } from '../../../lib/cv-editor';
import { colors } from '../../../theme/colors';
import { useStepSection } from '../useStepSection';
import { SectionSwitcher } from '../SectionSwitcher';
import { hasKey, useT } from '../../../i18n';

/** Stored values (CV data, same as the web). Only the label shown is translated. */
const PROFICIENCY_LEVELS = ['Native', 'Fluent', 'Advanced', 'Intermediate', 'Basic'];

/** Built per language so validation messages follow the app language. */
const makeSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t('languages.errors.nameRequired')),
  proficiency: z.string().min(1, t('languages.errors.proficiencyRequired')),
});

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export function LanguagesStep({ onValidChange }: { onValidChange: (v: boolean) => void }) {
  const { sections, updateSection, addSection } = useCVStore();
  const t = useT('cvEditor');
  const tc = useT('common');
  const schema = useMemo(() => makeSchema(t), [t]);
  /** Known stored levels show in the app language; anything else is shown as typed. */
  const levelLabel = (level: string) =>
    hasKey(`cvEditor.languages.levels.${level}`) ? t(`languages.levels.${level}`) : level;
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<LanguageItem | null>(null);
  const { section: langSection, sectionsForType, selectSection } = useStepSection(CVSectionType.LANGUAGES);
  const items = (langSection?.items ?? []) as LanguageItem[];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', proficiency: 'Fluent' },
  });

  const openAdd = () => {
    reset({ name: '', proficiency: 'Fluent' });
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
        id: generateId(), type: CVSectionType.LANGUAGES, title: sectionTypeLabel(CVSectionType.LANGUAGES),
        isVisible: true, order: sections.length, items: [newItem],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    setModalVisible(false);
  };

  const handleDelete = (itemId: string) => {
    Alert.alert(t('languages.deleteTitle'), t('languages.deleteBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () => {
          if (langSection) {
            updateSection(langSection.id, { items: items.filter((i) => i.id !== itemId) });
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
        <Text className="text-lg font-semibold text-stone-900 mb-1">{t('languages.title')}</Text>
        <Text className="text-stone-500 mb-5 text-sm">{t('languages.subtitle')}</Text>
        <SectionSwitcher sections={sectionsForType} selected={langSection} onSelect={selectSection} />
        {items.length === 0 ? (
          <View className="items-center py-8">
            <Ionicons name="language-outline" size={36} color={colors.stone[400]} />
            <Text className="text-stone-500 text-center mt-2 mb-4">{t('languages.empty')}</Text>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2 mb-4">
            {items.map((item) => (
              <View
                key={item.id}
                className="flex-row items-center rounded-full px-3 py-1.5 border border-brand-600 bg-brand-50"
              >
                <Text className="text-sm font-medium text-brand-700">
                  {item.name} · {levelLabel(item.proficiency)}
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
        <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color={colors.stone[700]} />} fullWidth>
          {t('languages.add')}
        </Button>
        <View className="h-8" />
      </ScrollView>
      <Modal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingItem ? t('languages.edit') : t('languages.add')}>
        <Controller control={control} name="name" render={({ field }) => (
          <Input label={t('languages.name')} placeholder={t('languages.namePlaceholder')} value={field.value} onChangeText={field.onChange} error={errors.name?.message} />
        )} />
        <Text className="text-sm font-medium text-stone-700 mb-2">{t('fields.proficiency')}</Text>
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
                  {levelLabel(level)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )} />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>{editingItem ? t('entry.update') : t('languages.add')}</Button>
      </Modal>
    </View>
  );
}
