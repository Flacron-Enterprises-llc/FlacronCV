import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { openLegalDocument } from '../../lib/legal-acceptance';

interface LegalAcceptanceModalProps {
  visible: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onAccept: () => void;
  onCancel: () => void;
  accepting?: boolean;
}

function DocLink({
  label,
  kind,
}: {
  label: string;
  kind: 'terms' | 'privacy' | 'disclaimer';
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

export function LegalSignupLine() {
  return (
    <Text className="text-xs text-stone-400 mb-5 leading-4">
      By creating an account, you agree to the FlacronCV{' '}
      <DocLink label="Terms of Service" kind="terms" /> and{' '}
      <DocLink label="Privacy Policy" kind="privacy" /> and acknowledge the{' '}
      <DocLink label="AI, ATS & Employment Disclaimer" kind="disclaimer" />.
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
  return (
    <Modal visible={visible} onClose={onCancel} title="Terms and Privacy" size="lg">
      <View className="flex-row items-start">
        <Pressable
          onPress={() => onCheckedChange(!checked)}
          disabled={accepting}
          className={[
            'mt-0.5 h-5 w-5 rounded border items-center justify-center mr-3',
            checked ? 'bg-brand-500 border-brand-500' : 'border-stone-300 bg-white',
          ].join(' ')}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
        >
          {checked ? <Text className="text-white text-xs font-bold">✓</Text> : null}
        </Pressable>
        <Text className="flex-1 text-sm text-stone-700 leading-5">
          I have read and agree to the FlacronCV <DocLink label="Terms of Service" kind="terms" />{' '}
          and <DocLink label="Privacy Policy" kind="privacy" />, and I acknowledge the{' '}
          <DocLink label="AI, ATS & Employment Disclaimer" kind="disclaimer" />. I understand that
          AI-generated content may contain errors, ATS scores are estimates, and FlacronCV does not
          guarantee interviews, job offers, employment, or other career outcomes.
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
          Agree and continue
        </Button>
        <Button variant="ghost" fullWidth onPress={onCancel} disabled={accepting}>
          Cancel
        </Button>
      </View>
    </Modal>
  );
}
