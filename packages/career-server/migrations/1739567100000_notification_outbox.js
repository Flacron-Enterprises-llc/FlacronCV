/**
 * Notification deliveries and digests become a small outbox.
 *
 * Before: the notifier was called first and success recorded afterwards, so
 * a crash (or a timeout after the provider accepted the message) left no
 * record and the next run sent again; a digest row was written before the
 * send, so a crash in between lost the digest.
 *
 * Now each logical message has a stable `message_id` (passed to the provider
 * as its idempotency key where one is supported), is claimed atomically
 * (`sending` + `claim_token` + `claimed_until`) before the send, is retried
 * with a bounded number of `attempts`, and ends `sent`, `failed` (definitely
 * not delivered after the last attempt) or `uncertain` (the provider may have
 * accepted it; never silently marked sent and never resent unless the
 * notifier declares provider-side idempotency). Existing rows keep their
 * meaning (`held`/`sent`). Additive only.
 */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE notification_deliveries
      ADD COLUMN message_id uuid NOT NULL DEFAULT gen_random_uuid(),
      ADD COLUMN attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN claim_token uuid,
      ADD COLUMN claimed_until timestamptz,
      ADD COLUMN last_error text;
    ALTER TABLE notification_deliveries DROP CONSTRAINT notification_deliveries_status_check;
    ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_status_check
      CHECK (status IN ('held', 'pending', 'sending', 'sent', 'uncertain', 'failed'));
    CREATE UNIQUE INDEX notification_deliveries_message_id_idx ON notification_deliveries (message_id);

    ALTER TABLE digests
      ADD COLUMN status text NOT NULL DEFAULT 'sent'
        CHECK (status IN ('pending', 'sending', 'sent', 'uncertain', 'failed')),
      ADD COLUMN message_id uuid NOT NULL DEFAULT gen_random_uuid(),
      ADD COLUMN attempts integer NOT NULL DEFAULT 0,
      ADD COLUMN claim_token uuid,
      ADD COLUMN claimed_until timestamptz,
      ADD COLUMN last_error text;
    ALTER TABLE digests ALTER COLUMN sent_at DROP NOT NULL;
    ALTER TABLE digests ALTER COLUMN sent_at DROP DEFAULT;
    CREATE UNIQUE INDEX digests_message_id_idx ON digests (message_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX digests_message_id_idx;
    UPDATE digests SET sent_at = now() WHERE sent_at IS NULL;
    ALTER TABLE digests ALTER COLUMN sent_at SET DEFAULT now();
    ALTER TABLE digests ALTER COLUMN sent_at SET NOT NULL;
    ALTER TABLE digests DROP COLUMN last_error, DROP COLUMN claimed_until, DROP COLUMN claim_token,
      DROP COLUMN attempts, DROP COLUMN message_id, DROP COLUMN status;
    DROP INDEX notification_deliveries_message_id_idx;
    DELETE FROM notification_deliveries WHERE status NOT IN ('held', 'sent');
    ALTER TABLE notification_deliveries DROP CONSTRAINT notification_deliveries_status_check;
    ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_status_check CHECK (status IN ('held', 'sent'));
    ALTER TABLE notification_deliveries DROP COLUMN last_error, DROP COLUMN claimed_until, DROP COLUMN claim_token,
      DROP COLUMN attempts, DROP COLUMN message_id;
  `);
};
