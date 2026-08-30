import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useCVStore } from '../../../store/cv-store';
import { CVSectionType } from '../../../types/enums';
import { CertificationItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { colors } from '../../../theme/colors';

const schema = z.object({
  name: z.string().min(1, 'Certification name is required'),
  issuer: z.string().min(1, 'Issuer is required'),
  date: z.string().min(1, 'Date is required'),
  expiryDate: z.string().optional(),
  credentialId: z.string().optional(),
  url: z.string().url('Invalid URL').optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

export function CertificationsStep({ onValidChange }: { onValidChange: (v: boolean) => void }) {
  const { sections, updateSection, addSection } = useCVStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<CertificationItem | null>(null);
  const certSection = sections.find((s) => s.type === CVSectionType.CERTIFICATIONS);
  const items = (certSection?.items ?? []) as CertificationItem[];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const openAdd = () => {
    reset({});
    setEditingItem(null);
    setModalVisible(true);
    onValidChange(true);
  };

  const openEdit = (item: CertificationItem) => {
    reset({
      name: item.name,
      issuer: item.issuer,
      date: item.date,
      credentialId: item.credentialId ?? '',
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    // Spread first so web-only keys (expiryDate, url, order, description, …) survive; form fields overlay so clears win.
    const newItem: CertificationItem = {
      ...(editingItem ?? {}),
      id: editingItem?.id ?? generateId(),
      name: data.name,
      issuer: data.issuer,
      date: data.date,
      credentialId: data.credentialId,
    };
    if (certSection) {
      const updatedItems = editingItem
        ? items.map((i) => (i.id === editingItem.id ? newItem : i))
        : [...items, newItem];
      updateSection(certSection.id, { items: updatedItems });
    } else {
      addSection({
        id: generateId(), type: CVSectionType.CERTIFICATIONS, title: 'Certifications',
        isVisible: true, order: sections.length, items: [newItem],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    setModalVisible(false);
  };

  const handleDelete = (itemId: string) => {
    if (certSection) {
      updateSection(certSection.id, { items: items.filter((i) => i.id !== itemId) });
    }
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5">
        <Text className="text-lg font-semibold text-stone-900 mb-1">Certifications</Text>
        <Text className="text-stone-500 mb-5 text-sm">Add your professional certifications and licenses.</Text>
        {items.map((item) => (
          <View key={item.id} className="bg-white border border-stone-100 rounded-xl p-4 mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="font-bold text-stone-900">{item.name}</Text>
                <Text className="text-stone-500 text-sm">{item.issuer}</Text>
                <Text className="text-stone-400 text-xs mt-1">{item.date}</Text>
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
        ))}
        <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color={colors.stone[700]} />} fullWidth>
          Add Certification
        </Button>
        <View className="h-8" />
      </ScrollView>
      <Modal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingItem ? 'Edit Certification' : 'Add Certification'}>
        <Controller control={control} name="name" render={({ field }) => (
          <Input label="Certification Name *" placeholder="AWS Solutions Architect" value={field.value} onChangeText={field.onChange} error={errors.name?.message} />
        )} />
        <Controller control={control} name="issuer" render={({ field }) => (
          <Input label="Issuing Organization *" placeholder="Amazon Web Services" value={field.value} onChangeText={field.onChange} error={errors.issuer?.message} />
        )} />
        <Controller control={control} name="date" render={({ field }) => (
          <Input label="Issue Date *" placeholder="Jan 2023" value={field.value} onChangeText={field.onChange} error={errors.date?.message} />
        )} />
        <Controller control={control} name="credentialId" render={({ field }) => (
          <Input label="Credential ID" placeholder="ABC123" value={field.value} onChangeText={field.onChange} />
        )} />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>{editingItem ? 'Update' : 'Add Certification'}</Button>
      </Modal>
    </View>
  );
}
