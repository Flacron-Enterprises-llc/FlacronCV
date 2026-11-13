import { useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useT } from '../i18n';

/**
 * Asks before leaving a career editor with unsaved edits (back gesture,
 * header back, Android back button, or a programmatic route change that
 * removes the screen). The edits themselves stay in memory (store/career-drafts)
 * until sign-out or the app closes; this makes sure leaving is a choice.
 * Same Stay / Leave choice as the website.
 */
export function useLeaveGuard(dirty: boolean): void {
  const navigation = useNavigation();
  const t = useT('ui');
  const tc = useT('common');
  useEffect(() => {
    if (!dirty) return undefined;
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      event.preventDefault();
      Alert.alert(
        t('leaveGuard.title'),
        t('leaveGuard.body'),
        [
          { text: t('leaveGuard.stay'), style: 'cancel' },
          { text: tc('unsaved.leave'), style: 'destructive', onPress: () => navigation.dispatch(event.data.action) },
        ],
        { cancelable: true },
      );
    });
    return unsubscribe;
  }, [navigation, dirty, t, tc]);
}
