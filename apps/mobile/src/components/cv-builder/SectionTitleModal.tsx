import React, { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { SECTION_TITLE_MAX, validateSectionTitle } from '../../lib/cv-editor';
import { useT } from '../../i18n';

interface SectionTitleModalProps {
  visible: boolean;
  heading: string;
  initialTitle: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (title: string) => void;
}

/** Name a new custom section or rename any section (AddSectionDto title rules). */
export function SectionTitleModal({
  visible,
  heading,
  initialTitle,
  confirmLabel,
  onClose,
  onSubmit,
}: SectionTitleModalProps) {
  const t = useT('cvEditor');
  const [value, setValue] = useState(initialTitle);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (visible) {
      setValue(initialTitle);
      setError(undefined);
    }
  }, [visible, initialTitle]);

  const submit = () => {
    const check = validateSectionTitle(value);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    onSubmit(check.title);
  };

  return (
    <Modal visible={visible} onClose={onClose} title={heading}>
      <Input
        label={t('sections.titleLabel')}
        value={value}
        onChangeText={(text) => {
          setValue(text);
          if (error) setError(undefined);
        }}
        maxLength={SECTION_TITLE_MAX}
        error={error}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Button variant="primary" fullWidth onPress={submit}>
        {confirmLabel}
      </Button>
    </Modal>
  );
}
