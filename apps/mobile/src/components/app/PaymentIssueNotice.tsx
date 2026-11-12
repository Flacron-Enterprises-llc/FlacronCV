import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import { useAuthStore } from '../../store/auth-store';
import { colors } from '../../theme/colors';
import { paymentIssueNotice } from './app-notices';

/**
 * Shown when the subscription payment is failing (past_due / unpaid /
 * incomplete) — the website's `DunningBanner`, minus its "Update payment
 * method" button: App Store / Play rules forbid linking to an external payment
 * portal, so this is text only and says where to update the payment method
 * (the website for web subscriptions, the store for in-app ones).
 */
export function PaymentIssueNotice({ className = '' }: { className?: string }) {
  const subscription = useAuthStore((s) => s.user?.subscription);
  const notice = paymentIssueNotice(subscription);
  if (!notice) return null;

  return (
    <View
      accessibilityRole="alert"
      className={`flex-row items-start rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 ${className}`}
    >
      <Ionicons name="warning-outline" size={20} color={colors.warning.DEFAULT} style={{ marginTop: 1 }} />
      <View className="flex-1 ml-3">
        <Text className="text-sm font-semibold text-amber-800">{notice.title}</Text>
        <Text className="text-sm text-amber-700 mt-0.5">{notice.body}</Text>
      </View>
    </View>
  );
}
