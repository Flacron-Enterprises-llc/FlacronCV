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
    const refused = await service.setSpecialistMode(ada, { modes: ['veterans'] }).catch((err: unknown) => err);
    expect(isBillingError(refused, 'plan_upgrade_required')).toBe(true);
    expect((await service.getSpecialistMode(ada)).available).toBe(false);
  });

  it('saves up to three of the nine modes on paid plans and exposes them as a mode context', async () => {
    await setPlan(ada, 'starter');
    const initial = await service.getSpecialistMode(ada);
    expect(initial.mode).toBeNull();
    expect(initial.modes).toEqual([]);

    const updated = await service.setSpecialistMode(ada, {
      modes: ['military_spouses', 'trades_licensed', 'military_spouses'],
      customGuidelines: 'Remote first please.',
    });
    expect(updated.modes).toEqual(['military_spouses', 'trades_licensed']);
    expect(updated.mode).toBe('military_spouses');
    expect(updated.focusAreas.length).toBeGreaterThan(0);

    const tooMany = await service
      .setSpecialistMode(ada, { modes: ['veterans', 'freelancers', 'career_changers', 'returning_workers'] })
      .catch((err: unknown) => err);
    expect(isBillingError(tooMany, 'validation_error')).toBe(true);
    const unknown = await service.setSpecialistMode(ada, { modes: ['general' as never] }).catch((err: unknown) => err);
    expect(isBillingError(unknown, 'validation_error')).toBe(true);

    // Older clients send one mode.
    expect((await service.setSpecialistMode(ada, { mode: 'veterans' })).modes).toEqual(['veterans']);

    const context = await service.modeContext(ada);
    expect(context.modes).toEqual(['veterans']);
    expect(context.checklist.map((item) => item.id)).toContain('translate_military_skills');
    expect(context.constraints.join(' ')).toMatch(/work authorization/);

    // A downgrade keeps the saved choice but the context stops applying it.
    await setPlan(ada, 'free');
    expect((await service.modeContext(ada)).modes).toEqual([]);
  });

  it('never assumes work authorization and separates current and future places', async () => {
    await setPlan(other, 'professional');
    const current = await service.createLocation(other, { place: 'Norfolk, VA', radiusMiles: 25 });
    expect(current).toMatchObject({ kind: 'current', workAuthorization: 'not_stated', licenseTransfer: 'not_stated', isRelocation: false });
    const future = await service.createLocation(other, {
      place: 'San Diego, CA',
      radiusMiles: 50,
      kind: 'future',
      moveDate: '2027-03-01',
      availableFrom: '2027-03-15',
      remoteRegion: 'United States',
    });
    expect(future).toMatchObject({ kind: 'future', isRelocation: true, moveDate: '2027-03-01', availableFrom: '2027-03-15', remoteRegion: 'United States' });
    const impossible = await service.createLocation(other, { place: 'X', radiusMiles: 5, moveDate: '2026-02-31' }).catch((err: unknown) => err);
    expect(isBillingError(impossible, 'validation_error')).toBe(true);
    const moved = await service.updateLocation(other, future.id, { place: 'Honolulu, HI' });
    expect(moved.id).toBe(future.id);
    const context = await service.modeContext(other);
    expect(context.locations.current.map((l) => l.id)).toEqual([current.id]);
    expect(context.locations.future.map((l) => l.place)).toEqual(['Honolulu, HI']);
    await service.deleteLocation(other, current.id);
    await service.deleteLocation(other, future.id);
  });

  it('deletes a place that a saved search uses, keeping the search', async () => {
    await setPlan(other, 'professional');
    const place = await service.createLocation(other, { place: 'Leeds', radiusMiles: 10 });
    const search = await db.pool.query<{ id: string }>(
      `INSERT INTO saved_searches (workspace_id, candidate_auth_user_id, filters, location_profile_id, schedule)
       VALUES ($1, $2, '{}'::jsonb, $3, 'weekly') RETURNING id`,
      [other.workspaceId, other.authUserId, place.id],
    );
    await service.deleteLocation(other, place.id);
    const kept = await db.pool.query(`SELECT location_profile_id FROM saved_searches WHERE id = $1`, [search.rows[0].id]);
    expect(kept.rows[0].location_profile_id).toBeNull();
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
