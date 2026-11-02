import { CATALOG_VERSION } from '@flacroncv/career-shared';
import { openBalances, readAccount } from '../billing/accounts';
import { BillingService } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import { isBillingError } from '../billing/errors';
import type { VerifiedIdentity } from '../identity/id-token';
import { IdentityService, type Principal } from '../identity/identity.service';
import { createTestDatabase, TestClock, TestDatabase } from '../testing';
import { CareerModesService } from './career-modes.service';

function identity(uid: string): VerifiedIdentity {
  const at = new Date('2026-10-17T10:00:00Z');
  return {
    uid,
    email: `${uid}@example.test`,
    emailVerified: true,
    authTime: at,
    issuedAt: at,
    signInProvider: 'password',
  };
}

describe('CV14: CareerModesService', () => {
  let db: TestDatabase;
  let identities: IdentityService;
  let service: CareerModesService;
  let clock: TestClock;
  let ada: Principal;
  let other: Principal;

  beforeAll(async () => {
    db = await createTestDatabase('career_modes');
    clock = new TestClock('2026-10-17T10:00:00Z');
    await new BillingService(db.pool, clock).publishCatalog();
    identities = new IdentityService(db.pool, CATALOG_VERSION, clock);
    ada = await identities.principal(identity('ada-modes'));
    other = await identities.principal(identity('other-modes'));

    service = new CareerModesService(db.pool);
  });

  afterAll(async () => {
    if (db) await db.drop();
  });

  async function setPlan(principal: Principal, planId: 'free' | 'starter' | 'professional' | 'career_pro') {
    await db.pool.query(`UPDATE billing_accounts SET plan_id = $1 WHERE id = $2`, [
      planId,
      principal.billingAccountId,
    ]);
    const acc = await readAccount(db.pool, principal.billingAccountId);
    const snapshot = await new CatalogStore().get(db.pool, acc.catalog_version);
    await openBalances(db.pool, acc, snapshot, { regrant: true });
  }

  it('lists empty locations initially and reflects plan radius and capacity', async () => {
    await setPlan(ada, 'free');
    const res = await service.listLocations(ada);
    expect(res.items).toEqual([]);
    expect(res.capacity).toBe(1);
    expect(res.allowedRadiusMiles).toBe(25);

    await setPlan(ada, 'professional');
    const proRes = await service.listLocations(ada);
    expect(proRes.capacity).toBe(5);
    expect(proRes.allowedRadiusMiles).toBe(100);
  });

  it('creates a location profile within plan radius cap', async () => {
    await setPlan(ada, 'free');
    const loc = await service.createLocation(ada, {
      place: 'San Francisco, CA',
      radiusMiles: 25,
      targetTimeline: 'immediate',
      isRelocation: true,
      workAuthorization: 'citizen',
      commuteMinutesMax: 30,
      remoteFlexibility: 'hybrid',
      notes: 'Prefer Mission Bay or SoMa.',
    });

    expect(loc.id).toBeDefined();
    expect(loc.place).toBe('San Francisco, CA');
    expect(loc.radiusMiles).toBe(25);
    expect(loc.isRelocation).toBe(true);
    expect(loc.commuteMinutesMax).toBe(30);

    const list = await service.listLocations(ada);
    expect(list.items.length).toBe(1);
    expect(list.items[0].id).toBe(loc.id);
  });

  it('rejects location creation when requested radius exceeds plan radius cap', async () => {
    await setPlan(ada, 'free');
    try {
      await service.createLocation(ada, {
        place: 'San Jose, CA',
        radiusMiles: 50, // Free plan cap is 25 miles
      });
      throw new Error('should have failed with radius cap');
    } catch (err) {
      expect(isBillingError(err, 'validation_error')).toBe(true);
      if (isBillingError(err, 'validation_error')) {
        expect(err.details).toMatchObject({
          field: 'radiusMiles',
          reason: 'exceeds_plan_radius_cap',
          maxAllowed: 25,
        });
      }
    }
  });

  it('rejects location creation when capacity is exceeded', async () => {
    await setPlan(ada, 'free');
    // ada already has 1 location created in prior test
    try {
      await service.createLocation(ada, {
        place: 'Oakland, CA',
        radiusMiles: 15,
      });
      throw new Error('should have failed with capacity exceeded');
    } catch (err) {
      expect(isBillingError(err, 'capacity_exceeded')).toBe(true);
      if (isBillingError(err, 'capacity_exceeded')) {
        expect(err.details).toMatchObject({
          field: 'locationProfiles',
          limit: 1,
          used: 1,
        });
      }
    }
  });

  it('updates and deletes a location profile', async () => {
    await setPlan(ada, 'professional');
    const loc = await service.createLocation(ada, {
      place: 'Seattle, WA',
      radiusMiles: 50,
      targetTimeline: '3_to_6_months',
      isRelocation: true,
    });

    const updated = await service.updateLocation(ada, loc.id, {
      commuteMinutesMax: 60,
      notes: 'Expanded search area to Bellevue.',
      radiusMiles: 75,
    });

    expect(updated.commuteMinutesMax).toBe(60);
    expect(updated.radiusMiles).toBe(75);
    expect(updated.notes).toBe('Expanded search area to Bellevue.');

    await service.deleteLocation(ada, loc.id);
    const item = await db.pool.query(`SELECT id FROM location_profiles WHERE id = $1`, [loc.id]);
    expect(item.rows).toEqual([]);
  });

  it('rejects specialist mode configuration on Free plan with plan_upgrade_required', async () => {
    await setPlan(ada, 'free');
    try {
      await service.setSpecialistMode(ada, {
        mode: 'technical_engineering',
      });
      throw new Error('should require plan upgrade');
    } catch (err) {
      expect(isBillingError(err, 'plan_upgrade_required')).toBe(true);
    }
  });

  it('enables specialist mode on paid plans (Starter and up)', async () => {
    await setPlan(ada, 'starter');

    // Default mode is general
    const defaultMode = await service.getSpecialistMode(ada);
    expect(defaultMode.mode).toBe('general');

    // Set to technical engineering
    const updated = await service.setSpecialistMode(ada, {
      mode: 'technical_engineering',
      focusAreas: ['Distributed Systems', 'Rust Async', 'Linux Internals'],
      customGuidelines: 'Focus heavily on consensus and low-latency benchmarks.',
    });

    expect(updated.mode).toBe('technical_engineering');
    expect(updated.focusAreas).toEqual(['Distributed Systems', 'Rust Async', 'Linux Internals']);
    expect(updated.customGuidelines).toBe('Focus heavily on consensus and low-latency benchmarks.');

    const reloaded = await service.getSpecialistMode(ada);
    expect(reloaded.mode).toBe('technical_engineering');
  });

  it('enforces tenant and candidate isolation on location profiles and specialist modes', async () => {
    await setPlan(ada, 'professional');
    await setPlan(other, 'professional');

    const locAda = await service.createLocation(ada, {
      place: 'Austin, TX',
      radiusMiles: 30,
    });

    try {
      await service.getLocation(other, locAda.id);
      throw new Error('should not access user A location');
    } catch (err) {
      expect(isBillingError(err, 'not_found')).toBe(true);
    }

    try {
      await service.updateLocation(other, locAda.id, { place: 'Hacked' });
      throw new Error('should not update user A location');
    } catch (err) {
      expect(isBillingError(err, 'not_found')).toBe(true);
    }

    try {
      await service.deleteLocation(other, locAda.id);
      throw new Error('should not delete user A location');
    } catch (err) {
      expect(isBillingError(err, 'not_found')).toBe(true);
    }
  });
});
