import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { PAID_UPGRADES_ENABLED, limitPrompt } from '../../config/paid-upgrades';
import { planBenefits, planName } from '../../lib/plan-catalog';
import type { UpgradeReason } from '../../lib/upgrade-prompts';
import { useT } from '../../i18n';
import { colors } from '../../theme/colors';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  reason: UpgradeReason;
  /** The account's effective plan id. */
  plan: string | null | undefined;
  templateName?: string;
  requiredTier?: string;
}

/**
 * The website's UpgradeModal for the app: the limit, then — only when the app
 * can sell a plan — the next of the five plans with its catalog benefits and a
 * "See plans" button to the in-app Plans screen (never a website link).
 */
export function UpgradeModal({ visible, onClose, reason, plan, templateName, requiredTier }: UpgradeModalProps) {
  const router = useRouter();
  const t = useT('plans');
  const tc = useT('common');
  const prompt = limitPrompt(reason, plan, { templateName, requiredTier });
  const offered = PAID_UPGRADES_ENABLED && prompt.upgradeable ? prompt.offeredPlan : null;

  return (
    <Modal visible={visible} onClose={onClose} title={prompt.title}>
      <View className="items-center py-4">
        <View className="w-16 h-16 rounded-full bg-brand-50 items-center justify-center mb-4">
          <Ionicons name="lock-closed" size={28} color={colors.brand[600]} />
        </View>
        <Text className="text-stone-600 text-center mb-4 leading-5">{prompt.message.split('\n\n')[0]}</Text>
        {offered ? (
          <View className="w-full rounded-xl border border-stone-200 bg-stone-50 p-4 mb-4">
            <Text className="font-semibold text-stone-900 mb-2">{t('planIncludes', { plan: planName(offered) })}</Text>
            {planBenefits(offered).map((benefit) => (
              <View key={benefit} className="flex-row items-start mb-1.5">
                <Ionicons name="checkmark-circle" size={16} color={colors.success.DEFAULT} style={{ marginTop: 2, marginEnd: 8 }} />
                <Text className="text-stone-700 text-sm flex-1 leading-5">{benefit}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View className="w-full gap-3">
          {PAID_UPGRADES_ENABLED && prompt.upgradeable ? (
            <Button
              variant="primary"
              fullWidth
              onPress={() => {
                onClose();
                router.push('/(dashboard)/settings/plans');
              }}
            >
              {t('upgrade.seePlans')}
            </Button>
          ) : null}
          <Button variant="ghost" fullWidth onPress={onClose}>
            {PAID_UPGRADES_ENABLED && prompt.upgradeable ? t('upgrade.notNow') : tc('ok')}
          </Button>
        </View>
      </View>
    </Modal>
  );
}
