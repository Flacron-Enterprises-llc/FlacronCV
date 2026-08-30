import { Ionicons } from '@expo/vector-icons';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CVWizard } from '../../../../src/components/cv-builder/CVWizard';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { useCV, useCVSections } from '../../../../src/hooks/useCVs';
import { useExportCV } from '../../../../src/hooks/useExport';
import { useCVStore } from '../../../../src/store/cv-store';
import { useAuthStore } from '../../../../src/store/auth-store';
import { canExport } from '../../../../src/lib/entitlements';
import { exportLimitReachedMessage, upgradeAlertButtons } from '../../../../src/config/paid-upgrades';
import { colors } from '../../../../src/theme/colors';

/** E5 — one prompt for in-app back, hardware Back, and Android gesture Back. */
function confirmUnsavedLeave(onLeave: () => void) {
  Alert.alert('Unsaved Changes', 'You have unsaved changes. Leave anyway?', [
    { text: 'Stay', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: onLeave },
  ]);
}

export default function CVEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const { setCV, setSections, cv: storeCV, isDirty } = useCVStore();
  const exportCV = useExportCV();

  const { data: cv, isLoading: cvLoading, error } = useCV(id);
  const { data: sections, isLoading: sectionsLoading } = useCVSections(id);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  // Hydrate once per CV id. Re-applying React Query data after a save (or a
  // background refetch) called setCV, which sets isDirty=false — Continue
  // would then skip the PUT and look like a successful save.
  useEffect(() => {
    if (!id || !cv || !sections) return;
    if (hydratedId === id) return;
    setCV(cv);
    setSections(sections);
    setHydratedId(id);
  }, [id, cv, sections, hydratedId, setCV, setSections]);

  // beforeRemove (via usePreventRemove): native stack turns Android predictive
  // back / system gesture / hardware Back into a POP of this route. BackHandler
  // only sees the key event and is the wrong layer for the gesture.
  const guardExit = hydratedId === id && isDirty;
  usePreventRemove(guardExit, ({ data }) => {
    confirmUnsavedLeave(() => navigation.dispatch(data.action));
  });

  const handleExport = async (format: 'pdf' | 'docx') => {
    const exports = user?.usage?.exportsThisMonth ?? 0;

    if (!canExport(user?.subscription, exports)) {
      Alert.alert(
        'Export Limit Reached',
        exportLimitReachedMessage(),
        upgradeAlertButtons(() => router.push('/(dashboard)/settings/billing')),
      );
      return;
    }

    exportCV.mutate({ cvId: id!, format });
  };

  if (cvLoading || sectionsLoading || hydratedId !== id) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator size="large" color={colors.brand[600]} />
        <Text className="text-stone-500 mt-3">Loading CV...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return <ErrorState message="Failed to load CV" onRetry={() => router.back()} />;
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      {/* Top Bar */}
      <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-stone-100">
        <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
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
          className="flex-row items-center bg-brand-600 px-3 py-2 rounded-xl"
          disabled={exportCV.isPending}
        >
          {exportCV.isPending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Ionicons name="download-outline" size={16} color={colors.white} />
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
