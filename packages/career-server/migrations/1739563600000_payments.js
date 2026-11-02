/**
 * docs/DATA_MODEL.md `purchases` and `billing_events`, plus what the
 * webhooks need around them:
 *
 * - `checkout_sessions`: what the server chose for each checkout, so a
 *   completed pack checkout is matched to our SKU, never to a price id in
 *   the payload. Not in the first draft of the data model.
 * - `billing_accounts.scheduled_plan_id` / `scheduled_interval`: a
 *   downgrade waits until the period ends (DATA_MODEL, upgrade walkthrough).
 * - `billing_accounts.provider_state_at`: the newest provider state applied,
 *   so an older event delivered late does not undo a newer one.
 * - `packs.purchase_id`: the purchase a pack came from, for refunds.
 *
 * Currency is the provider's three-letter code. Stores charge in local
 * currency, so it is not forced to USD here. Amount and currency are null
 * when the provider's notification does not carry them (Google Play), and
 * `refunded_cents` is null when a refund did not say how much.
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE purchases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      provider text NOT NULL CHECK (provider IN ('stripe', 'apple', 'google')),
      provider_payment_id text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('subscription', 'pack', 'capacity')),
      catalog_version text NOT NULL REFERENCES catalog_versions(version),
      sku text NOT NULL,
      amount_cents integer CHECK (amount_cents >= 0),
      currency text CHECK (currency ~ '^[A-Z]{3}$'),
      purchased_at timestamptz NOT NULL,
      refunded_cents integer,
      refunded_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT purchases_provider_payment_unique UNIQUE (provider, provider_payment_id),
      CONSTRAINT purchases_amount_has_currency CHECK ((amount_cents IS NULL) = (currency IS NULL)),
      CONSTRAINT purchases_refund_in_range CHECK (
        refunded_cents IS NULL OR (refunded_cents >= 0 AND (amount_cents IS NULL OR refunded_cents <= amount_cents))
      ),
      CONSTRAINT purchases_refund_has_date CHECK (refunded_cents IS NULL OR refunded_at IS NOT NULL)
    );
    CREATE INDEX purchases_account_idx ON purchases (billing_account_id, purchased_at);

    ALTER TABLE packs ADD COLUMN purchase_id uuid REFERENCES purchases(id);
    CREATE UNIQUE INDEX packs_purchase_idx ON packs (purchase_id) WHERE purchase_id IS NOT NULL;

    CREATE TABLE billing_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      provider text NOT NULL CHECK (provider IN ('stripe', 'apple', 'google')),
      provider_event_id text NOT NULL,
      event_type text NOT NULL,
      billing_account_id uuid REFERENCES billing_accounts(id),
      outcome text NOT NULL DEFAULT 'received' CHECK (outcome IN ('received', 'applied', 'ignored', 'rejected')),
      detail text,
      received_at timestamptz NOT NULL,
      processed_at timestamptz,
      CONSTRAINT billing_events_provider_event_unique UNIQUE (provider, provider_event_id)
    );
    CREATE INDEX billing_events_rejected_idx ON billing_events (received_at) WHERE outcome = 'rejected';

    CREATE TABLE checkout_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      billing_account_id uuid NOT NULL REFERENCES billing_accounts(id),
      provider text NOT NULL CHECK (provider = 'stripe'),
      idempotency_key text NOT NULL,
      request_fingerprint text NOT NULL,
      kind text NOT NULL CHECK (kind IN ('subscription', 'pack')),
      catalog_version text NOT NULL REFERENCES catalog_versions(version),
      sku text NOT NULL,
      interval text CHECK (interval IN ('monthly', 'annual')),
      trial_days integer CHECK (trial_days > 0),
      price_ref text NOT NULL,
      provider_session_id text,
      url text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT checkout_sessions_idempotency_unique UNIQUE (billing_account_id, idempotency_key),
      CONSTRAINT checkout_sessions_provider_session_unique UNIQUE (provider, provider_session_id),
      CONSTRAINT checkout_sessions_interval_matches CHECK ((kind = 'subscription') = (interval IS NOT NULL))
    );

    ALTER TABLE billing_accounts
      ADD COLUMN scheduled_plan_id text
        CHECK (scheduled_plan_id IN ('free', 'starter', 'professional', 'career_pro', 'business')),
      ADD COLUMN scheduled_interval text CHECK (scheduled_interval IN ('monthly', 'annual')),
      ADD COLUMN provider_state_at timestamptz,
      ADD CONSTRAINT billing_accounts_schedule_complete CHECK (
        (scheduled_plan_id IS NULL) = (scheduled_interval IS NULL)
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE billing_accounts
      DROP CONSTRAINT billing_accounts_schedule_complete,
      DROP COLUMN provider_state_at,
      DROP COLUMN scheduled_interval,
      DROP COLUMN scheduled_plan_id;
    DROP TABLE checkout_sessions;
    DROP TABLE billing_events;
    DROP INDEX packs_purchase_idx;
    ALTER TABLE packs DROP COLUMN purchase_id;
    DROP TABLE purchases;
  `);
};
