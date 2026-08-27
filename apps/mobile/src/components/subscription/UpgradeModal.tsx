import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PAID_UPGRADES_ENABLED } from '../../config/paid-upgrades';

/** Unused; S1 is evaluated INSIDE this file. Do not import on iOS with the flag on until IAP exists. */
interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  feature: string;
  requiredPlan?: string;
}

export function UpgradeModal({ visible, onClose, feature, requiredPlan = 'Pro' }: UpgradeModalProps) {
  const router = useRouter();

  return (
    <Modal visible={visible} onClose={onClose} title={PAID_UPGRADES_ENABLED ? 'Upgrade Required' : 'Not included'}>
      <View className="items-center py-4">
        <View className="w-16 h-16 rounded-full bg-brand-50 items-center justify-center mb-4">
          <Ionicons name="lock-closed" size={28} color="#f97316" />
        </View>
        <Text className="text-lg font-bold text-stone-900 text-center mb-2">
          {requiredPlan} Feature
        </Text>
        <Text className="text-stone-500 text-center mb-6 leading-5">
          <Text className="font-semibold text-stone-700">{feature}</Text> requires a{' '}
          {requiredPlan} plan or higher.
          {PAID_UPGRADES_ENABLED
            ? ' Upgrade to unlock this and many more features.'
            : ' It is not included in your current plan.'}
        </Text>

        <View className="w-full gap-3">
          {PAID_UPGRADES_ENABLED ? (
            <Button
              variant="primary"
              fullWidth
              onPress={() => {
                onClose();
                router.push('/(dashboard)/settings/billing');
              }}
            >
              Upgrade to {requiredPlan}
            </Button>
          ) : null}
          <Button variant="ghost" fullWidth onPress={onClose}>
            {PAID_UPGRADES_ENABLED ? 'Maybe Later' : 'OK'}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
