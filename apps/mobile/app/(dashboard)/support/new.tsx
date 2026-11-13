import { zodResolver } from '@hookform/resolvers/zod';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import axios from 'axios';
import React, { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { useCreateTicket } from '../../../src/hooks/useSupport';
import { TicketCategory, TicketPriority } from '../../../src/types/enums';
import { colors } from '../../../src/theme/colors';
import { t as tNow, useT } from '../../../src/i18n';
import { RTL_FLIP } from '../../../src/i18n/native';

/** Built per language (zod messages are fixed when the schema is made). */
function makeSchema(t: (key: string) => string) {
  return z.object({
    subject: z.string().min(5, t('form.subjectMin')),
    message: z.string().min(20, t('form.messageMin')),
    category: z.nativeEnum(TicketCategory),
    priority: z.nativeEnum(TicketPriority),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

function requestFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return tNow('common.noConnection');
  }
  return tNow('support.form.createError');
}

const CATEGORIES = [
  { value: TicketCategory.BUG, label: () => tNow('support.form.categories.bug'), icon: 'bug-outline' },
  { value: TicketCategory.FEATURE_REQUEST, label: () => tNow('support.form.categories.featureRequest'), icon: 'bulb-outline' },
  { value: TicketCategory.BILLING, label: () => tNow('support.form.categories.billing'), icon: 'card-outline' },
  { value: TicketCategory.ACCOUNT, label: () => tNow('support.form.categories.account'), icon: 'person-outline' },
  { value: TicketCategory.GENERAL, label: () => tNow('support.form.categories.general'), icon: 'help-circle-outline' },
];

const PRIORITIES = [
  { value: TicketPriority.LOW, label: () => tNow('support.form.priorities.low'), color: colors.success.DEFAULT },
  { value: TicketPriority.MEDIUM, label: () => tNow('support.form.priorities.medium'), color: colors.brand[600] },
  { value: TicketPriority.HIGH, label: () => tNow('support.form.priorities.high'), color: colors.error.DEFAULT },
];

export default function NewTicketScreen() {
  const t = useT('support');
  const schema = useMemo(() => makeSchema(t), [t]);
  const router = useRouter();
  const createTicket = useCreateTicket();

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: TicketCategory.GENERAL, priority: TicketPriority.MEDIUM },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createTicket.mutateAsync({
        subject: data.subject,
        message: data.message,
        category: data.category,
        priority: data.priority,
      });
      router.replace('/(dashboard)/support');
    } catch (err) {
      Alert.alert(t('form.createErrorTitle'), requestFailureMessage(err));
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center px-5 pt-4 pb-3 border-b border-stone-100">
          <TouchableOpacity onPress={() => router.back()} className="me-3" accessibilityRole="button" accessibilityLabel={t('goBack')}>
            <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
          </TouchableOpacity>
          <Text className="text-xl font-black text-stone-900">{t('form.title')}</Text>
        </View>

        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          <Controller control={control} name="subject" render={({ field }) => (
            <Input label={t('form.subject')} placeholder={t('form.subjectPh')} value={field.value} onChangeText={field.onChange} error={errors.subject?.message} />
          )} />
          <Controller control={control} name="message" render={({ field }) => (
            <Input label={t('form.description')} placeholder={t('form.descriptionPh')} value={field.value} onChangeText={field.onChange} multiline numberOfLines={5} className="min-h-28" error={errors.message?.message} />
          )} />

          <Text className="text-sm font-medium text-stone-700 mb-2">{t('form.category')}</Text>
          <Controller control={control} name="category" render={({ field }) => (
            <View className="flex-row flex-wrap gap-2 mb-4">
              {CATEGORIES.map((cat) => (
                <TouchableOpacity key={cat.value} onPress={() => field.onChange(cat.value)}
                  className={['flex-row items-center px-3 py-2 rounded-xl border', field.value === cat.value ? 'border-brand-600 bg-brand-50' : 'border-stone-200'].join(' ')}>
                  <Ionicons name={cat.icon as any} size={14} color={field.value === cat.value ? colors.brand[600] : colors.stone[500]} />
                  <Text className={['text-sm ms-1.5', field.value === cat.value ? 'text-brand-700 font-semibold' : 'text-stone-600'].join(' ')}>{cat.label()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )} />

          <Text className="text-sm font-medium text-stone-700 mb-2">{t('form.priority')}</Text>
          <Controller control={control} name="priority" render={({ field }) => (
            <View className="flex-row gap-2 mb-6">
              {PRIORITIES.map((p) => (
                <TouchableOpacity key={p.value} onPress={() => field.onChange(p.value)}
                  className={['flex-1 py-2.5 items-center rounded-xl border', field.value === p.value ? 'border-2' : 'border'].join(' ')}
                  style={{ borderColor: field.value === p.value ? p.color : colors.stone[200], backgroundColor: field.value === p.value ? p.color + '15' : 'transparent' }}>
                  <Text className="font-semibold" style={{ color: field.value === p.value ? p.color : colors.stone[500] }}>{p.label()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )} />

          <Button variant="primary" fullWidth size="lg" loading={createTicket.isPending} onPress={handleSubmit(onSubmit)}>
            {t('form.submit')}
          </Button>
          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
