import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import { z } from 'zod';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { useCVStore } from '../../../store/cv-store';
import { CVSectionType } from '../../../types/enums';
import { ExperienceItem } from '../../../types/cv.types';
import { generateId } from '../../../lib/utils';
import { formatHighlights, ITEM_ARRAY_MAX, parseHighlights, sectionTypeLabel } from '../../../lib/cv-editor';
import { colors } from '../../../theme/colors';
import { useStepSection } from '../useStepSection';
import { SectionSwitcher } from '../SectionSwitcher';
import { useT } from '../../../i18n';

/** Built per language so validation messages follow the app language. */
const makeSchema = (t: (key: string) => string) => z.object({
  company: z.string().min(1, t('experience.errors.companyRequired')),
  position: z.string().min(1, t('experience.errors.positionRequired')),
  location: z.string().optional(),
  startDate: z.string().min(1, t('errors.startDateRequired')),
  endDate: z.string().optional(),
  isCurrent: z.boolean(),
  description: z.string().optional(),
  /** One highlight per line (ExperienceItem.highlights). */
  highlights: z.string().optional(),
});

type FormData = z.infer<ReturnType<typeof makeSchema>>;

interface ExperienceStepProps {
  onValidChange: (isValid: boolean) => void;
}

export function ExperienceStep({ onValidChange }: ExperienceStepProps) {
  const { sections, updateSection, addSection } = useCVStore();
  const t = useT('cvEditor');
  const tc = useT('common');
  const schema = useMemo(() => makeSchema(t), [t]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ExperienceItem | null>(null);

  const { section: experienceSection, sectionsForType, selectSection } = useStepSection(CVSectionType.EXPERIENCE);
  const items = (experienceSection?.items ?? []) as ExperienceItem[];

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isCurrent: false },
  });

  const isCurrent = watch('isCurrent');

  const openAdd = () => {
    reset({
      company: '',
      position: '',
      location: '',
      startDate: '',
      endDate: '',
      isCurrent: false,
      description: '',
      highlights: '',
    });
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
      highlights: formatHighlights(item.highlights),
    });
    setEditingItem(item);
    setModalVisible(true);
  };

  const onSubmit = (data: FormData) => {
    // Spread first so other keys (order, …) survive; form fields overlay so clears win.
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
      highlights: parseHighlights(data.highlights),
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
        title: sectionTypeLabel(CVSectionType.EXPERIENCE),
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
    Alert.alert(t('experience.deleteTitle'), t('experience.deleteBody'), [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
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
        <Text className="text-lg font-semibold text-stone-900 mb-1">{t('experience.title')}</Text>
        <Text className="text-stone-500 mb-5 text-sm">{t('experience.subtitle')}</Text>
        <SectionSwitcher sections={sectionsForType} selected={experienceSection} onSelect={selectSection} />

        {items.length === 0 ? (
          <View className="items-center py-10">
            <View className="w-16 h-16 rounded-full bg-stone-100 items-center justify-center mb-3">
              <Ionicons name="briefcase-outline" size={28} color={colors.stone[400]} />
            </View>
            <Text className="text-stone-500 text-center mb-4">{t('experience.empty')}</Text>
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
                    {item.startDate} — {item.isCurrent ? t('entry.present') : item.endDate}
                  </Text>
                  {item.location && (
                    <Text className="text-stone-400 text-xs">{item.location}</Text>
                  )}
                  {(item.highlights?.length ?? 0) > 0 && (
                    <Text className="text-stone-400 text-xs">
                      {t('experience.highlightsCount', { count: item.highlights!.length })}
                    </Text>
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
          {t('experience.add')}
        </Button>

        <View className="h-8" />
      </ScrollView>

      <Modal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        title={editingItem ? t('experience.edit') : t('experience.add')}
        size="lg"
      >
        <Controller
          control={control}
          name="position"
          render={({ field }) => (
            <Input
              label={t('fields.jobTitle')}
              placeholder={t('experience.jobTitlePlaceholder')}
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
              label={t('fields.company')}
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
              label={t('experience.location')}
              placeholder={t('experience.locationPlaceholder')}
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
                  label={t('fields.startDate')}
                  placeholder={t('experience.startPlaceholder')}
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
                    label={t('fields.endDate')}
                    placeholder={t('experience.endPlaceholder')}
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
              <Text className="text-stone-700 font-medium">{t('experience.current')}</Text>
              <Switch
                value={field.value}
                onValueChange={field.onChange}
                trackColor={{ true: colors.brand[600] }}
              />
            </View>
          )}
        />

        <Controller
          control={control}
          name="description"
          render={({ field }) => (
            <Input
              label={t('fields.description')}
              placeholder={t('experience.descriptionPlaceholder')}
              value={field.value}
              onChangeText={field.onChange}
              multiline
              numberOfLines={4}
              className="min-h-24"
            />
          )}
        />

        <Controller
          control={control}
          name="highlights"
          render={({ field }) => (
            <Input
              label={t('experience.highlights')}
              placeholder={t('experience.highlightsPlaceholder')}
              hint={t('experience.highlightsHint', { max: ITEM_ARRAY_MAX })}
              value={field.value}
              onChangeText={field.onChange}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="min-h-24"
            />
          )}
        />

        <Button variant="primary" fullWidth onPress={handleSubmit(onSubmit)}>
          {editingItem ? t('entry.update') : t('experience.add')}
        </Button>
      </Modal>
    </View>
  );
}
