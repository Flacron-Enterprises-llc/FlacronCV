import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAppConfig } from '../../hooks/useAppConfig';
import { useT } from '../../i18n';
import { colors } from '../../theme/colors';
import { activeAnnouncement, type AnnouncementType } from './app-notices';

/** Tailwind blue-600 — the theme has no "info" hex (blue-* classes are Tailwind defaults). */
const INFO_BLUE = '#2563eb';

const STYLES: Record<
  AnnouncementType,
  { wrap: string; text: string; icon: keyof typeof Ionicons.glyphMap; iconColor: string }
> = {
  info: {
    wrap: 'border-blue-300 bg-blue-50',
    text: 'text-blue-800',
    icon: 'information-circle-outline',
    iconColor: INFO_BLUE,
  },
  warning: {
    wrap: 'border-amber-300 bg-amber-50',
    text: 'text-amber-800',
    icon: 'warning-outline',
    iconColor: colors.warning.DEFAULT,
  },
  success: {
    wrap: 'border-emerald-300 bg-emerald-50',
    text: 'text-emerald-800',
    icon: 'checkmark-circle-outline',
    iconColor: colors.success.DEFAULT,
  },
  danger: {
    wrap: 'border-red-300 bg-red-50',
    text: 'text-red-800',
    icon: 'close-circle-outline',
    iconColor: colors.error.DEFAULT,
  },
};

/**
 * Dismissal lives for the app session (the website uses sessionStorage), keyed
 * by message text so an edited announcement shows again.
 */
let dismissedThisSession: string | null = null;

/**
 * Operator announcement from CRM Settings (GET /app-config), like the website's
 * `AnnouncementBanner`. Renders nothing when there is no active announcement.
 * The message is operator-authored free text and is shown verbatim.
 */
export function AnnouncementBanner({ className = '' }: { className?: string }) {
  const t = useT('notices.announcement');
  const { data } = useAppConfig();
  const [dismissed, setDismissed] = useState<string | null>(dismissedThisSession);

  const announcement = activeAnnouncement(data, dismissed);
  if (!announcement) return null;

  const style = STYLES[announcement.type];
  const dismiss = () => {
    dismissedThisSession = announcement.message;
    setDismissed(announcement.message);
  };

  return (
    <View
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      className={`flex-row items-start rounded-2xl border px-4 py-3 ${style.wrap} ${className}`}
    >
      <Ionicons name={style.icon} size={20} color={style.iconColor} style={{ marginTop: 1 }} />
      <Text className={`flex-1 text-sm ms-3 ${style.text}`}>{announcement.message}</Text>
      <TouchableOpacity
        onPress={dismiss}
        className="w-11 h-11 -me-3 -my-2.5 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={t('dismiss')}
      >
        <Ionicons name="close" size={18} color={style.iconColor} />
      </TouchableOpacity>
    </View>
  );
}
