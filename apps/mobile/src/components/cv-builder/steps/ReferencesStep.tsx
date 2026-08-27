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
import { ReferenceItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  title: z.string().min(1, 'Title is required'),
  company: z.string().min(1, 'Company is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  relationship: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export function ReferencesStep({ onValidChange }: { onValidChange: (v: boolean) => void }) {
  const { sections, updateSection, addSection } = useCVStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ReferenceItem | null>(null);
  const refSection = sections.find((s) => s.type === CVSectionType.REFERENCES);
  const items = (refSection?.items ?? []) as ReferenceItem[];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const openAdd = () => {
    reset({});
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
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    // Spread first so web-only keys (relationship, order, description, …) survive; form fields overlay so clears win.
    const newItem: ReferenceItem = {
      ...(editingItem ?? {}),
      id: editingItem?.id ?? generateId(),
      name: data.name,
      title: data.title,
      company: data.company,
      email: data.email || undefined,
      phone: data.phone,
    };
    if (refSection) {
      const updatedItems = editingItem
        ? items.map((i) => (i.id === editingItem.id ? newItem : i))
        : [...items, newItem];
      updateSection(refSection.id, { items: updatedItems });
    } else {
      addSection({
        id: generateId(), type: CVSectionType.REFERENCES, title: 'References',
        isVisible: true, order: sections.length, items: [newItem],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
    }
    setModalVisible(false);
  };

  const handleDelete = (itemId: string) => {
    if (refSection) {
      updateSection(refSection.id, { items: items.filter((i) => i.id !== itemId) });
    }
  };

  return (
    <View className="flex-1">
      <ScrollView className="flex-1 px-5">
        <Text className="text-lg font-bold text-stone-900 mb-1">References</Text>
        <Text className="text-stone-500 mb-5 text-sm">Add professional references who can vouch for your work.</Text>
        {items.map((item) => (
          <View key={item.id} className="bg-white border border-stone-100 rounded-xl p-4 mb-3">
            <View className="flex-row items-start justify-between">
              <View className="flex-1">
                <Text className="font-bold text-stone-900">{item.name}</Text>
                <Text className="text-stone-500 text-sm">{item.title} at {item.company}</Text>
                {item.email && <Text className="text-stone-400 text-xs mt-0.5">{item.email}</Text>}
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
        ))}
        <Button variant="outline" onPress={openAdd} icon={<Ionicons name="add" size={18} color="#374151" />} fullWidth>
          Add Reference
        </Button>
        <View className="h-8" />
      </ScrollView>
      <Modal visible={modalVisible} onClose={() => setModalVisible(false)} title={editingItem ? 'Edit Reference' : 'Add Reference'} size="lg">
        <Controller control={control} name="name" render={({ field }) => (
          <Input label="Full Name *" placeholder="Jane Smith" value={field.value} onChangeText={field.onChange} error={errors.name?.message} />
        )} />
        <Controller control={control} name="title" render={({ field }) => (
          <Input label="Job Title *" placeholder="Engineering Manager" value={field.value} onChangeText={field.onChange} error={errors.title?.message} />
        )} />
        <Controller control={control} name="company" render={({ field }) => (
          <Input label="Company *" placeholder="Google" value={field.value} onChangeText={field.onChange} error={errors.company?.message} />
        )} />
        <Controller control={control} name="email" render={({ field }) => (
          <Input label="Email" placeholder="jane@google.com" keyboardType="email-address" autoCapitalize="none" value={field.value} onChangeText={field.onChange} error={errors.email?.message} />
        )} />
        <Controller control={control} name="phone" render={({ field }) => (
          <Input label="Phone" placeholder="+1 (555) 000-0000" keyboardType="phone-pad" value={field.value} onChangeText={field.onChange} />
        )} />
        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>{editingItem ? 'Update' : 'Add Reference'}</Button>
      </Modal>
    </View>
  );
}
