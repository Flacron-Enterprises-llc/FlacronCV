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
import { ReferenceItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { sectionTypeLabel } from '../../../lib/cv-editor';
import { colors } from '../../../theme/colors';
import { useStepSection } from '../useStepSection';
import { SectionSwitcher } from '../SectionSwitcher';
import { useT } from '../../../i18n';

/** Built per language so validation messages follow the app language. */
const makeSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t('references.errors.nameRequired')),
  title: z.string().min(1, t('references.errors.titleRequired')),
  company: z.string().min(1, t('references.errors.companyRequired')),
  email: z.string().email(t('references.errors.invalidEmail')).optional().or(z.literal('')),
  phone: z.string().optional(),
  relationship: z.string().optional(),
});

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export function ReferencesStep({ onValidChange }: { onValidChange: (v: boolean) => void }) {
  const { sections, updateSection, addSection } = useCVStore();
  const t = useT('cvEditor');
  const tc = useT('common');
  const schema = useMemo(() => makeSchema(t), [t]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ReferenceItem | null>(null);
  const { section: refSection, sectionsForType, selectSection } = useStepSection(CVSectionType.REFERENCES);
  const items = (refSection?.items ?? []) as ReferenceItem[];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', title: '', company: '', email: '', phone: '', relationship: '' },
  });

  const openAdd = () => {
    reset({ name: '', title: '', company: '', email: '', phone: '', relationship: '' });
    setEditingItem(null);
    setModalVisible(true);
    onValidChange(true);
  };

  const openEdit = (item: ReferenceItem) => {
    reset({
      name: item.name,
      title: item.title,
      company: item.company,
      email: item.email ?? '',
      phone: item.phone ?? '',
      relationship: item.relationship ?? '',
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    // Spread first so other keys (order, …) survive; form fields overlay so clears win.
    const newItem: ReferenceItem = {
      ...(editingItem ?? {}),
      id: editingItem?.id ?? generateId(),
      name: data.name,
      title: data.title,
      company: data.company,
      email: data.email || undefined,
      phone: data.phone,
      relationship: (data.relationship ?? '').trim(),
    };
    if (refSection) {
      const updatedItems = editingItem
        ? items.map((i) => (i.id === editingItem.id ? newItem : i))
        : [...items, newItem];
      updateSection(refSection.id, { items: updatedItems });
    } else {
      addSection({
        id: generateId(), type: CVSectionType.REFERENCES, title: sectionTypeLabel(CVSectionType.REFERENCES),
        isVisible: true, order: sections.length, items: [newItem],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    setModalVisible(false);
  };

  const handleDelete = (itemId: string) => {
    Alert.alert(t('references.deleteTitle'), t('references.deleteBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () => {
          if (refSection) {
            updateSection(refSection.id, { items: items.filter((i) => i.id !== itemId) });
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
        <Text className="text-lg font-semibold text-stone-900 mb-1">{t('references.title')}</Text>
        <Text className="text-stone-500 mb-5 text-sm">{t('references.subtitle')}</Text>
        <SectionSwitcher sections={sectionsForType} selected={refSection} onSelect={selectSection} />
        {items.length === 0 ? (
          <View className="items-center py-10">
            <View className="w-16 h-16 rounded-full bg-stone-100 items-center justify-center mb-3">
              <Ionicons name="people-outline" size={28} color={colors.stone[400]} />
            </View>
            <Text className="text-stone-500 text-center mb-4">{t('references.empty')}</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} className="bg-white border border-stone-100 rounded-xl p-4 mb-3">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="font-bold text-stone-900">{item.name}</Text>
                  <Text className="text-stone-500 text-sm">{t('references.titleAtCompany', { title: item.title, company: item.company })}</Text>
                  {item.relationship ? <Text className="text-stone-400 text-xs mt-0.5">{item.relationship}</Text> : null}
                  {item.email && <Text className="text-stone-400 text-xs mt-0.5">{item.email}</Text>}
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
          {t('references.add')}
        </Button>
        <View className="h-8" />
      </ScrollView>
      <Modal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingItem ? t('references.edit') : t('references.add')} size="lg">
        <Controller control={control} name="name" render={({ field }) => (
          <Input label={t('references.fullName')} placeholder="Jane Smith" value={field.value} onChangeText={field.onChange} error={errors.name?.message} />
        )} />
        <Controller control={control} name="title" render={({ field }) => (
          <Input label={t('fields.jobTitle')} placeholder={t('references.jobTitlePlaceholder')} value={field.value} onChangeText={field.onChange} error={errors.title?.message} />
        )} />
        <Controller control={control} name="company" render={({ field }) => (
          <Input label={t('fields.company')} placeholder="Google" value={field.value} onChangeText={field.onChange} error={errors.company?.message} />
        )} />
        <Controller control={control} name="email" render={({ field }) => (
          <Input label={t('references.email')} placeholder="jane@google.com" keyboardType="email-address" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={errors.email?.message} />
        )} />
        <Controller control={control} name="phone" render={({ field }) => (
          <Input label={t('references.phone')} placeholder="+1 (555) 000-0000" keyboardType="phone-pad" value={field.value} onChangeText={field.onChange} />
        )} />
        <Controller control={control} name="relationship" render={({ field }) => (
          <Input label={t('references.relationship')} placeholder={t('references.relationshipPlaceholder')} value={field.value} onChangeText={field.onChange} />
        )} />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>{editingItem ? t('entry.update') : t('references.add')}</Button>
      </Modal>
    </View>
  );
}
