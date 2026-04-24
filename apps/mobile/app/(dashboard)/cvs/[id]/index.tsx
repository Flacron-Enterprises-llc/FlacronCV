import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CVWizard } from '../../../../src/components/cv-builder/CVWizard';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { useCV, useCVSections, useUpdateCV } from '../../../../src/hooks/useCVs';
import { useExportCV } from '../../../../src/hooks/useExport';
import { useCVStore } from '../../../../src/store/cv-store';
import { useAuthStore } from '../../../../src/store/auth-store';
import { canExport } from '../../../../src/lib/utils';
import { SubscriptionPlan } from '../../../../src/types/enums';

export default function CVEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();
  const { setCV, setSections, cv: storeCV, isDirty } = useCVStore();
  const exportCV = useExportCV();

  const { data: cv, isLoading: cvLoading, error } = useCV(id);
  const { data: sections, isLoading: sectionsLoading } = useCVSections(id);
  const updateCV = useUpdateCV(id!);

  useEffect(() => {
    if (cv) setCV(cv);
    if (sections) setSections(sections);
  }, [cv, sections]);

  const handleExport = async (format: 'pdf' | 'docx') => {
    const plan = user?.subscription?.plan ?? SubscriptionPlan.FREE;
    const exports = user?.usage?.exportsThisMonth ?? 0;

    if (!canExport(plan, exports)) {
      Alert.alert(
        'Export Limit Reached',
        'You have reached your monthly export limit. Upgrade to Pro for unlimited exports.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/(dashboard)/settings/billing') },
        ],
      );
      return;
    }

    exportCV.mutate({ cvId: id!, format });
  };

  if (cvLoading || sectionsLoading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color="#f97316" />
        <Text className="text-stone-500 mt-3">Loading CV...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load CV" onRetry={() => router.back()} />;
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top']}>
      {/* Top Bar */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-stone-100">
        <TouchableOpacity onPress={() => {
          if (isDirty) {
            Alert.alert('Unsaved Changes', 'You have unsaved changes. Leave anyway?', [
              { text: 'Stay', style: 'cancel' },
              { text: 'Leave', style: 'destructive', onPress: () => router.back() },
            ]);
          } else {
            router.back();
          }
        }} className="flex-row items-center">
          <Ionicons name="arrow-back" size={22} color="#374151" />
        </TouchableOpacity>

        <View className="flex-1 px-3">
          <Text className="font-bold text-stone-900 text-center" numberOfLines={1}>
            {storeCV?.title ?? cv?.title ?? 'Editing CV'}
          </Text>
          {isDirty && (
            <Text className="text-xs text-brand-400 text-center">Unsaved changes</Text>
          )}
        </View>

        <TouchableOpacity
          onPress={() => Alert.alert('Export', 'Choose format:', [
            { text: 'PDF', onPress: () => handleExport('pdf') },
            { text: 'DOCX', onPress: () => handleExport('docx') },
            { text: 'Cancel', style: 'cancel' },
          ])}
          className="flex-row items-center bg-brand-500 px-3 py-2 rounded-xl"
          disabled={exportCV.isPending}
        >
          {exportCV.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="download-outline" size={16} color="#fff" />
              <Text className="text-white font-semibold ml-1 text-sm">Export</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* CV Wizard */}
      <CVWizard
        cvId={id!}
        onFinish={() => router.push('/(dashboard)/cvs')}
      />
    </SafeAreaView>
  );
}
