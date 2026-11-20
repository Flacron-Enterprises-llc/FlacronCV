import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { openLegalDocument } from '../../lib/legal-acceptance';
import { useT, type TFunction } from '../../i18n';

interface LegalAcceptanceModalProps {
  visible: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onAccept: () => void;
  onCancel: () => void;
  accepting?: boolean;
}

type DocKind = 'terms' | 'privacy' | 'disclaimer';

const DOC_TOKEN = /(\{terms\}|\{privacy\}|\{disclaimer\})/;

function DocLink({
  label,
  kind,
}: {
  label: string;
  kind: DocKind;
}) {
  return (
    <Text
      className="font-medium text-brand-600"
      onPress={() => void openLegalDocument(kind)}
    >
      {label}
    </Text>
  );
}

/**
 * Renders a translated sentence whose `{terms}` / `{privacy}` / `{disclaimer}`
 * placeholders become tappable document links. The sentence is translated
 * without params so the placeholders survive, then split on them.
 * `t` is the `auth` namespace translator.
 */
function withDocLinks(sentence: string, t: TFunction): React.ReactNode[] {
  const labels: Record<DocKind, string> = {
    terms: t('legal.terms'),
    privacy: t('legal.privacy'),
    disclaimer: t('legal.disclaimer'),
  };
  return sentence.split(DOC_TOKEN).map((part, i) => {
    const match = /^\{(terms|privacy|disclaimer)\}$/.exec(part);
    if (!match) return part;
    const kind = match[1] as DocKind;
    return <DocLink key={`${kind}-${i}`} label={labels[kind]} kind={kind} />;
  });
}

export function LegalSignupLine() {
  const t = useT('auth');
  return (
    <Text className="text-xs text-stone-400 mb-5 leading-4">
      {withDocLinks(t('legal.signupLine'), t)}
    </Text>
  );
}

export function LegalAcceptanceModal({
  visible,
  checked,
  onCheckedChange,
  onAccept,
  onCancel,
  accepting = false,
}: LegalAcceptanceModalProps) {
  const t = useT('auth');
  const tc = useT('common');
  return (
    <Modal
      visible={visible}
      onClose={onCancel}
      title={t('legal.title')}
      size="lg"
      closeDisabled={accepting}
    >
      <View className="flex-row items-start">
        <Pressable
          onPress={() => onCheckedChange(!checked)}
          disabled={accepting}
          className={[
            'mt-0.5 h-5 w-5 rounded border items-center justify-center me-3',
            checked ? 'bg-brand-600 border-brand-600' : 'border-stone-300 bg-surface',
          ].join(' ')}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
        >
          {checked ? <Text className="text-white text-xs font-bold">✓</Text> : null}
        </Pressable>
        <Text className="flex-1 text-sm text-stone-700 leading-5">
          {withDocLinks(t('legal.checkbox'), t)}
        </Text>
      </View>

      <View className="mt-6 gap-2">
        <Button
          variant="primary"
          fullWidth
          onPress={onAccept}
          disabled={!checked || accepting}
          loading={accepting}
        >
          {t('legal.accept')}
        </Button>
        <Button variant="ghost" fullWidth onPress={onCancel} disabled={accepting}>
          {tc('cancel')}
        </Button>
      </View>
    </Modal>
  );
}
