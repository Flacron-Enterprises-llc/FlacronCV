'use client';

import Modal from '@/components/ui/Modal';
import { Button } from './Button';

/**
 * Asks before a destructive or paid action, on V1's accessible Modal (focus
 * trap, Escape, backdrop). The caller keeps the open state and runs the
 * action in `onConfirm`.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal isOpen={open} onClose={busy ? () => undefined : onCancel} title={title} size="sm">
      {body ? <p className="text-pretty text-sm text-stone-600 dark:text-stone-300">{body}</p> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="button" variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
