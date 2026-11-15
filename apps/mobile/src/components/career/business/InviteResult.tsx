import React from 'react';
import { Text, View } from 'react-native';
import type { BusinessInvitation } from '../../../../../../packages/career-api-client/src/types';
import { BUSINESS_WEB_ORIGIN } from '../../../hooks/career/business';
import { getLocale, useT } from '../../../i18n';
import { inviteLink, inviteNote, inviteToken } from '../../../lib/career/business';
import { Button } from '../../ui/Button';
import { shareText } from './parts';

/** The invitation just created: whether it was emailed, and the link (or code) to share. */
export function InviteResult({ invitation }: { invitation: BusinessInvitation }) {
  const t = useT('careerBusiness');
  const link = inviteLink(invitation.invitePath, BUSINESS_WEB_ORIGIN, getLocale());
  const shown = link ?? inviteToken(invitation.invitePath) ?? invitation.invitePath;
  return (
    <View className="rounded-xl border border-stone-200 bg-stone-50 p-3 mt-3" accessibilityLiveRegion="polite">
      <Text className="text-stone-800 text-sm leading-5">{inviteNote(invitation)}</Text>
      {link ? null : <Text className="text-stone-500 text-xs mt-1 leading-4">{t('mobile.codeOnly')}</Text>}
      <Text selectable className="text-stone-900 text-xs mt-2" style={{ writingDirection: 'ltr', fontFamily: 'monospace' }}>
        {shown}
      </Text>
      <View className="mt-2 self-start">
        <Button variant="outline" size="sm" onPress={() => void shareText(shown)} accessibilityHint={t('scope.copyLink')}>
          {t('mobile.shareLink')}
        </Button>
      </View>
    </View>
  );
}
