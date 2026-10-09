#!/usr/bin/env node
/**
 * Stamp `app_id` on FlacronCV subscriptions and customers created before the
 * Flacron Stripe standard.
 *
 * The API applies a webhook only when the Stripe object carries FlacronCV's
 * app_id, so a pre-standard subscription would stop syncing renewals and
 * cancellations. Ownership is decided by PRICE, never by guessing: a
 * subscription is FlacronCV's only if its item is a price stamped
 * `app_id=flacron-cv`. A subscription or customer already stamped with
 * another app_id is reported and left alone.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=rk_test_… node scripts/stripe-backfill-app-id.mjs [--dry-run]
 *   STRIPE_SECRET_KEY=rk_live_… node scripts/stripe-backfill-app-id.mjs --live [--dry-run]
 */
const APP_ID = process.env.APP_ID?.trim() || 'flacron-cv';
const args = new Set(process.argv.slice(2));
const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
const mode = /^(?:sk|rk)_(live|test)_/.exec(key)?.[1];
if (!mode) throw new Error('STRIPE_SECRET_KEY must be an sk_/rk_ live/test key.');
if (mode === 'live' && !args.has('--live')) throw new Error('Live key: re-run with --live to confirm.');
const dryRun = args.has('--dry-run');
const auth = 'Basic ' + Buffer.from(key + ':').toString('base64');

async function stripe(method, path, params = {}) {
  const body = new URLSearchParams();
  const add = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const name = prefix ? `${prefix}[${k}]` : k;
      if (v && typeof v === 'object') add(v, name);
      else if (v !== undefined && v !== null) body.append(name, String(v));
    }
  };
  add(params);
  const url = 'https://api.stripe.com' + path + (method === 'GET' ? `?${body}` : '');
  const res = await fetch(url, {
    method,
    headers: { Authorization: auth, 'Stripe-Version': '2024-04-10', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json.error?.message}`);
  return json;
}

async function listAll(path, params = {}) {
  const out = [];
  let starting_after;
  for (;;) {
    const page = await stripe('GET', path, { limit: 100, ...params, starting_after });
    out.push(...page.data);
    if (!page.has_more) return out;
    starting_after = page.data.at(-1).id;
  }
}

const ourPrices = (await listAll('/v1/prices')).filter((p) => p.metadata?.app_id === APP_ID);
console.log(`${mode} mode — ${ourPrices.length} ${APP_ID} prices${dryRun ? ' (dry run)' : ''}`);

const stats = { subsStamped: 0, subsAlready: 0, subsForeign: 0, customersStamped: 0 };
const seenCustomers = new Set();
for (const price of ourPrices) {
  const subs = await listAll('/v1/subscriptions', { price: price.id, status: 'all', 'expand[]': 'data.customer' });
  for (const sub of subs) {
    const owner = sub.metadata?.app_id;
    const customer = typeof sub.customer === 'object' ? sub.customer : null;
    const userId = sub.metadata?.internal_user_id || sub.metadata?.firebaseUid || customer?.metadata?.firebaseUid || customer?.metadata?.internal_user_id;

    if (owner && owner !== APP_ID) {
      stats.subsForeign++;
      console.warn(`  ! ${sub.id} is on our price ${price.id} but stamped ${owner} — left alone`);
    } else if (owner === APP_ID) {
      stats.subsAlready++;
    } else {
      stats.subsStamped++;
      console.log(`  stamp subscription ${sub.id} (${sub.status})${userId ? ` user=${userId}` : ''}`);
      if (!dryRun) {
        await stripe('POST', `/v1/subscriptions/${sub.id}`, {
          metadata: { app_id: APP_ID, ...(userId ? { internal_user_id: userId, firebaseUid: userId } : {}) },
        });
      }
    }

    if (customer && !customer.deleted && !seenCustomers.has(customer.id)) {
      seenCustomers.add(customer.id);
      const cOwner = customer.metadata?.app_id;
      if (!cOwner && (!owner || owner === APP_ID)) {
        stats.customersStamped++;
        console.log(`  stamp customer ${customer.id}`);
        if (!dryRun) {
          await stripe('POST', `/v1/customers/${customer.id}`, {
            metadata: { app_id: APP_ID, ...(userId ? { internal_user_id: userId } : {}) },
          });
        }
      } else if (cOwner && cOwner !== APP_ID) {
        console.warn(`  ! customer ${customer.id} is stamped ${cOwner} — left alone`);
      }
    }
  }
}
console.log(JSON.stringify(stats));
