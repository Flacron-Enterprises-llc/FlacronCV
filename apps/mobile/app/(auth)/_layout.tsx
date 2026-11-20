import { Redirect, Stack } from 'expo-router';
import { usePalette } from '../../src/theme/palette';
import { useAuthStore } from '../../src/store/auth-store';

export default function AuthLayout() {
  const palette = usePalette();
  const { firebaseUser, isInitialized, legalGate } = useAuthStore();

  if (isInitialized && firebaseUser && !legalGate) {
    return <Redirect href="/(dashboard)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.page } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
    </Stack>
  );
}
