import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PAID_UPGRADES_ENABLED } from '../../config/paid-upgrades';
import { useT } from '../../i18n';

/** Unused; S1 is evaluated INSIDE this file. Do not import on iOS with the flag on until IAP exists. */
interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  feature: string;
  requiredPlan?: string;
}

/** Stands in for {feature} so the translated sentence can be split around the bold name. */
const FEATURE_SLOT = '\u0000';

export function UpgradeModal({ visible, onClose, feature, requiredPlan = 'Pro' }: UpgradeModalProps) {
  const router = useRouter();
  const t = useT('subscription.upgradeModal');
  const tc = useT('common');

  const [beforeFeature, afterFeature = ''] = t('requires', {
    feature: FEATURE_SLOT,
    plan: requiredPlan,
  }).split(FEATURE_SLOT);
  const hint = PAID_UPGRADES_ENABLED ? t('upgradeHint') : t('notIncludedHint');

  return (
    <Modal visible={visible} onClose={onClose} title={PAID_UPGRADES_ENABLED ? t('upgradeRequired') : t('notIncluded')}>
      <View className="items-center py-4">
        <View className="w-16 h-16 rounded-full bg-brand-50 items-center justify-center mb-4">
          <Ionicons name="lock-closed" size={28} color="#f97316" />
        </View>
        <Text className="text-lg font-bold text-stone-900 text-center mb-2">
          {t('planFeature', { plan: requiredPlan })}
        </Text>
        <Text className="text-stone-500 text-center mb-6 leading-5">
          {beforeFeature}
          <Text className="font-semibold text-stone-700">{feature}</Text>
          {[afterFeature, hint].join(' ')}
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
              {t('upgradeTo', { plan: requiredPlan })}
            </Button>
          ) : null}
          <Button variant="ghost" fullWidth onPress={onClose}>
            {PAID_UPGRADES_ENABLED ? t('maybeLater') : tc('ok')}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
