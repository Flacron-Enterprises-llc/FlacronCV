import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useT } from '../../i18n';
import { useAuthStore } from '../../store/auth-store';
import { colors } from '../../theme/colors';
import { Button } from '../ui/Button';
import { maintenanceMessage } from './app-notices';

/**
 * When the operator turns on Maintenance Mode in CRM Settings, non-admin users
 * see a maintenance screen instead of the app (website `MaintenanceGate`).
 * Admins / super-admins pass through. If /app-config cannot be read, the app
 * stays usable (fails open, as on the web).
 *
 * While blocking, it re-checks every minute (and on "Check again"), so the app
 * comes back on its own once maintenance ends — there is no page reload on mobile.
 */
export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  // Subscribing re-renders on a language change, so the fallback message follows it.
  const t = useT('notices.maintenance');
  const role = useAuthStore((s) => s.user?.role);
  const { data, refetch, isFetching } = useAppConfig({
    // Poll only while this user is blocked.
    pollWhile: (config) => maintenanceMessage(config, role) != null,
  });
  const message = maintenanceMessage(data, role);

  if (!message) return <>{children}</>;

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <View className="flex-1 items-center justify-center px-8" accessibilityLiveRegion="polite">
        <View className="w-16 h-16 rounded-full bg-amber-50 items-center justify-center mb-5">
          <Ionicons name="construct-outline" size={32} color={colors.warning.DEFAULT} />
        </View>
        <Text className="text-lg font-medium text-stone-700 text-center" accessibilityRole="header">
          {message}
        </Text>
        <View className="mt-6">
          <Button variant="outline" loading={isFetching} onPress={() => void refetch()}>
            {t('checkAgain')}
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}
