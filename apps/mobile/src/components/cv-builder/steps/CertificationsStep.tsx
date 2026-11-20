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
import { CertificationItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { buildCertificationItem, sectionTypeLabel } from '../../../lib/cv-editor';
import { colors } from '../../../theme/colors';
import { useStepSection } from '../useStepSection';
import { SectionSwitcher } from '../SectionSwitcher';
import { useT } from '../../../i18n';

/** Built per language so validation messages follow the app language. */
const makeSchema = (t: (key: string) => string) => z.object({
  name: z.string().min(1, t('certifications.errors.nameRequired')),
  issuer: z.string().min(1, t('certifications.errors.issuerRequired')),
  date: z.string().min(1, t('certifications.errors.dateRequired')),
  expiryDate: z.string().optional(),
  credentialId: z.string().optional(),
  // Soft like the website — the API stores a plain string, not a strict URL.
  url: z.string().optional(),
});

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export function CertificationsStep({ onValidChange }: { onValidChange: (v: boolean) => void }) {
  const { sections, updateSection, addSection } = useCVStore();
  const t = useT('cvEditor');
  const tc = useT('common');
  const schema = useMemo(() => makeSchema(t), [t]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<CertificationItem | null>(null);
  const { section: certSection, sectionsForType, selectSection } = useStepSection(CVSectionType.CERTIFICATIONS);
  const items = (certSection?.items ?? []) as CertificationItem[];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', issuer: '', date: '', expiryDate: '', credentialId: '', url: '' },
  });

  const openAdd = () => {
    reset({ name: '', issuer: '', date: '', expiryDate: '', credentialId: '', url: '' });
    setEditingItem(null);
    setModalVisible(true);
    onValidChange(true);
  };

  const openEdit = (item: CertificationItem) => {
    reset({
      name: item.name,
      issuer: item.issuer,
      date: item.date,
      expiryDate: item.expiryDate ?? '',
      credentialId: item.credentialId ?? '',
      url: item.url ?? '',
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    // Keeps other keys (order, …); form fields overlay so clears win. Blank expiry → null like web.
    const newItem: CertificationItem = buildCertificationItem(
      editingItem?.id ?? generateId(),
      editingItem,
      data,
    );
    if (certSection) {
      const updatedItems = editingItem
        ? items.map((i) => (i.id === editingItem.id ? newItem : i))
        : [...items, newItem];
      updateSection(certSection.id, { items: updatedItems });
    } else {
      addSection({
        id: generateId(), type: CVSectionType.CERTIFICATIONS, title: sectionTypeLabel(CVSectionType.CERTIFICATIONS),
        isVisible: true, order: sections.length, items: [newItem],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    setModalVisible(false);
  };

  const handleDelete = (itemId: string) => {
    Alert.alert(t('certifications.deleteTitle'), t('certifications.deleteBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () => {
          if (certSection) {
            updateSection(certSection.id, { items: items.filter((i) => i.id !== itemId) });
          }
        },
      },
    ]);
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5" keyboardShouldPersistTaps="handled">
        <Text className="text-lg font-semibold text-stone-900 mb-1">{t('certifications.title')}</Text>
        <Text className="text-stone-500 mb-5 text-sm">{t('certifications.subtitle')}</Text>
        <SectionSwitcher sections={sectionsForType} selected={certSection} onSelect={selectSection} />
        {items.length === 0 ? (
          <View className="items-center py-10">
            <View className="w-16 h-16 rounded-full bg-stone-100 items-center justify-center mb-3">
              <Ionicons name="ribbon-outline" size={28} color={colors.stone[400]} />
            </View>
            <Text className="text-stone-500 text-center mb-4">{t('certifications.empty')}</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} className="bg-surface border border-stone-100 rounded-xl p-4 mb-3">
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="font-bold text-stone-900">{item.name}</Text>
                  <Text className="text-stone-500 text-sm">{item.issuer}</Text>
                  <Text className="text-stone-400 text-xs mt-1">
                    {item.expiryDate
                      ? `${item.date} · ${t('certifications.expires', { date: item.expiryDate })}`
                      : item.date}
                  </Text>
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
          {t('certifications.add')}
        </Button>
        <View className="h-8" />
      </ScrollView>
      <Modal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingItem ? t('certifications.edit') : t('certifications.add')} size="lg">
        <Controller control={control} name="name" render={({ field }) => (
          <Input label={t('certifications.name')} placeholder="AWS Solutions Architect" value={field.value} onChangeText={field.onChange} error={errors.name?.message} />
        )} />
        <Controller control={control} name="issuer" render={({ field }) => (
          <Input label={t('certifications.issuer')} placeholder="Amazon Web Services" value={field.value} onChangeText={field.onChange} error={errors.issuer?.message} />
        )} />
        <Controller control={control} name="date" render={({ field }) => (
          <Input label={t('certifications.issueDate')} placeholder={t('certifications.issuePlaceholder')} value={field.value} onChangeText={field.onChange} error={errors.date?.message} />
        )} />
        <Controller control={control} name="expiryDate" render={({ field }) => (
          <Input label={t('certifications.expiry')} placeholder={t('certifications.expiryPlaceholder')} value={field.value} onChangeText={field.onChange} />
        )} />
        <Controller control={control} name="credentialId" render={({ field }) => (
          <Input label={t('certifications.credentialId')} placeholder={t('certifications.credentialPlaceholder')} value={field.value} onChangeText={field.onChange} />
        )} />
        <Controller control={control} name="url" render={({ field }) => (
          <Input label={t('fields.website')} placeholder={t('fields.websitePlaceholder')} keyboardType="url" autoCapitalize="none" autoCorrect={false} value={field.value} onChangeText={field.onChange} />
        )} />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>{editingItem ? t('entry.update') : t('certifications.add')}</Button>
      </Modal>
    </View>
  );
}
