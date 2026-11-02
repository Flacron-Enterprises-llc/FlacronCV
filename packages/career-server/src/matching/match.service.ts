import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import { explainMatch } from '@flacroncv/career-shared';
import type { MatchExplanation, MatchFit, MatchLine } from '@flacroncv/career-shared';
import { readAccount } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import type { JsonValue, MeteredResult } from '../metering/metering.service';
import { MeteringService } from '../metering/metering.service';
import type { ProfileOwner } from '../profile/career-profile.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface MatchRow {
  id: string;
  profile_version: number;
  opportunity_id: string;
  opportunity_revision_id: string;
  resume_version_id: string;
  fit: string;
  overlap: number;
  reasons: unknown;
  gaps: unknown;
  unknowns: unknown;
  created_at: Date;
  candidate_auth_user_id: string;
  workspace_id: string;
}

export interface MatchView {
  id: string;
  fit: MatchFit;
  overlap: number;
  reasons: MatchExplanation['reasons'];
  gaps: MatchExplanation['gaps'];
  unknowns: MatchExplanation['unknowns'];
  profileVersion: number;
  opportunityId: string;
  opportunityRevisionId: string;
  resumeVersionId: string;
  createdAt: string;
}

export interface AnalysisCredit {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface MatchOutcome {
  match: MatchView;
  usage: AnalysisCredit & { unit: string; includedGranted: number; packHeld: number; ledgerState: string };
  jobId: string | null;
  replayed: boolean;
}

/**
 * One explicit comparison of a resume version and a listing revision.
 * The same profile version reopens the saved row and does not reserve.
 * Scheduled matching is not this service.
 */
export class MatchService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly metering: MeteringService,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async get(owner: ProfileOwner, analysisId: string): Promise<MatchView> {
    if (!UUID.test(analysisId)) throw new BillingError('not_found');
    const rows = await this.pool.query<MatchRow>(
      `SELECT id, profile_version, opportunity_id, opportunity_revision_id, resume_version_id,
              fit, overlap, reasons, gaps, unknowns, created_at, candidate_auth_user_id, workspace_id
         FROM match_results WHERE id = $1`,
      [analysisId],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return this.view(row);
  }

  async find(owner: ProfileOwner, query: { opportunityId?: string; resumeVersionId?: string }): Promise<{ match: MatchView | null }> {
    if (!query.opportunityId || !UUID.test(query.opportunityId) || !query.resumeVersionId || !UUID.test(query.resumeVersionId)) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid' });
    }
    const loaded = await this.loadPair(owner, query.resumeVersionId, query.opportunityId);
    const row = await this.cached(owner, loaded.profileVersion, loaded.revisionId, query.resumeVersionId);
    return { match: row ? this.view(row) : null };
  }

  async compare(
    owner: ProfileOwner,
    input: { resumeVersionId?: string; opportunityId?: string; mode?: string },
    idempotencyKey: string | undefined,
    requireExplicit: boolean,
  ): Promise<MatchOutcome> {
    if (requireExplicit && input.mode !== 'explicit') {
      throw new BillingError('validation_error', { field: 'mode', reason: 'invalid' });
    }
    if (!input.resumeVersionId || !UUID.test(input.resumeVersionId)) {
      throw new BillingError('validation_error', { field: 'resumeVersionId', reason: 'invalid' });
    }
    if (!input.opportunityId || !UUID.test(input.opportunityId)) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid' });
    }
    const loaded = await this.loadPair(owner, input.resumeVersionId, input.opportunityId);
    const existing = await this.cached(owner, loaded.profileVersion, loaded.revisionId, input.resumeVersionId);
    if (existing) {
      const usage = await this.credit(owner);
      return {
        match: this.view(existing),
        usage: { unit: 'resume_analysis', includedGranted: 0, packHeld: 0, ledgerState: 'committed', ...usage },
        jobId: null,
        replayed: true,
      };
    }
    const explained = explainMatch(loaded.listing, loaded.lines, this.today());
    let saved: MatchView | null = null;
    const metered: MeteredResult<JsonValue> = await this.metering.run<MatchExplanation, JsonValue>({
      spender: owner,
      kind: 'match.explicit',
      unit: 'resume_analysis',
      feature: 'resumeAnalyses',
      idempotencyKey,
      body: { resumeVersionId: input.resumeVersionId, opportunityId: input.opportunityId, mode: 'explicit' },
      requestId: randomUUID(),
      provenance: {
        outputSchemaVersion: 'match@1',
        inputVersions: {
          profileVersion: loaded.profileVersion,
          opportunityRevisionId: loaded.revisionId,
          resumeVersionId: input.resumeVersionId,
        },
      },
      execute: async () => explained,
      save: async (db, output) => {
        const inserted = await db.query<MatchRow>(
          `INSERT INTO match_results
             (workspace_id, candidate_auth_user_id, profile_version, opportunity_id, opportunity_revision_id,
              resume_version_id, fit, overlap, reasons, gaps, unknowns, preferences)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb)
           RETURNING id, profile_version, opportunity_id, opportunity_revision_id, resume_version_id,
                     fit, overlap, reasons, gaps, unknowns, created_at, candidate_auth_user_id, workspace_id`,
          [
            owner.workspaceId,
            owner.authUserId,
            loaded.profileVersion,
            input.opportunityId,
            loaded.revisionId,
            input.resumeVersionId,
            output.fit,
            output.overlap,
            JSON.stringify(output.reasons),
            JSON.stringify(output.gaps),
            JSON.stringify(output.unknowns),
            JSON.stringify(loaded.preferences),
          ],
        );
        saved = this.view(inserted.rows[0]);
        return this.json(saved);
      },
    });
    const match = saved ?? parseMatch(metered.result);
    return {
      match,
      usage: {
        unit: metered.usage.unit,
        includedGranted: metered.usage.includedGranted,
        includedRemaining: metered.usage.includedRemaining,
        packRemaining: metered.usage.packRemaining,
        packHeld: metered.usage.packHeld,
        renewalDate: metered.usage.renewalDate.toISOString(),
        ledgerState: metered.usage.ledgerState,
      },
      jobId: metered.jobId,
      replayed: metered.replayed,
    };
  }

  private async loadPair(owner: ProfileOwner, resumeVersionId: string, opportunityId: string): Promise<{
    profileVersion: number;
    revisionId: string;
    lines: MatchLine[];
    listing: Parameters<typeof explainMatch>[0];
    preferences: unknown;
  }> {
    const resume = await this.pool.query<{ body: unknown; workspace_id: string; candidate_auth_user_id: string }>(
      `SELECT v.body, r.workspace_id, r.candidate_auth_user_id
         FROM resume_versions v
         JOIN resumes r ON r.id = v.resume_id
        WHERE v.id = $1`,
      [resumeVersionId],
    );
    const version = resume.rows[0];
    if (!version) throw new BillingError('not_found');
    if (version.workspace_id !== owner.workspaceId || version.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    const opportunity = await this.pool.query<{
      revision_id: string;
      title: string;
      description: string;
      status: string;
      deadline: string | null;
      locations: unknown;
      compensation: unknown;
      eligibility: unknown;
      candidate_auth_user_id: string | null;
    }>(
      `SELECT r.id AS revision_id, r.title, r.description, o.status, r.deadline, r.locations, r.compensation, r.eligibility,
              o.candidate_auth_user_id
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1`,
      [opportunityId],
    );
    const listing = opportunity.rows[0];
    if (!listing) throw new BillingError('not_found');
    if (listing.candidate_auth_user_id !== null && listing.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    const facts = await this.pool.query<{ id: string; confirmation: string }>(
      `SELECT id, confirmation FROM career_facts WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    const confirmed = new Set(facts.rows.filter((fact) => fact.confirmation === 'confirmed').map((fact) => fact.id));
    const profile = await this.pool.query<{ version: number; preferences: unknown }>(
      `SELECT version, preferences FROM career_profiles WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    const compensation = isRecord(listing.compensation) ? listing.compensation : {};
    const eligibility = isRecord(listing.eligibility) ? listing.eligibility : {};
    const sponsorship = eligibility.sponsorship === 'stated_yes' || eligibility.sponsorship === 'stated_no' ? eligibility.sponsorship : 'unknown';
    return {
      profileVersion: profile.rows[0]?.version ?? 0,
      revisionId: listing.revision_id,
      preferences: profile.rows[0]?.preferences ?? {},
      lines: linesOf(version.body).map((line) => ({ ...line, confirmed: confirmed.has(line.factId) })),
      listing: {
        status: listing.status === 'closed' ? 'closed' : 'open',
        deadline: listing.deadline,
        title: listing.title,
        description: listing.description,
        locations: strings(listing.locations),
        payKnown: typeof compensation.minimum === 'number' || typeof compensation.maximum === 'number',
        sponsorship,
      },
    };
  }

  private async cached(
    owner: ProfileOwner,
    profileVersion: number,
    revisionId: string,
    resumeVersionId: string,
  ): Promise<MatchRow | null> {
    const rows = await this.pool.query<MatchRow>(
      `SELECT id, profile_version, opportunity_id, opportunity_revision_id, resume_version_id,
              fit, overlap, reasons, gaps, unknowns, created_at, candidate_auth_user_id, workspace_id
         FROM match_results
        WHERE candidate_auth_user_id = $1 AND profile_version = $2
          AND opportunity_revision_id = $3 AND resume_version_id = $4`,
      [owner.authUserId, profileVersion, revisionId, resumeVersionId],
    );
    return rows.rows[0] ?? null;
  }

  private async credit(owner: ProfileOwner): Promise<AnalysisCredit> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    const balance = await unitBalance(this.pool, account, snapshot, 'resume_analysis', this.clock.now());
    return {
      includedRemaining: balance.includedRemaining,
      packRemaining: balance.packRemaining,
      renewalDate: balance.renewalDate.toISOString(),
    };
  }

  private view(row: MatchRow): MatchView {
    const fit = row.fit === 'blocked' || row.fit === 'none' || row.fit === 'partial' || row.fit === 'strong' ? row.fit : 'none';
    return {
      id: row.id,
      fit,
      overlap: typeof row.overlap === 'number' ? row.overlap : 0,
      reasons: reasonsOf(row.reasons),
      gaps: gapsOf(row.gaps),
      unknowns: unknownsOf(row.unknowns),
      profileVersion: row.profile_version,
      opportunityId: row.opportunity_id,
      opportunityRevisionId: row.opportunity_revision_id,
      resumeVersionId: row.resume_version_id,
      createdAt: row.created_at.toISOString(),
    };
  }

  private json(match: MatchView): JsonValue {
    return {
      id: match.id,
      fit: match.fit,
      overlap: match.overlap,
      reasons: match.reasons.map((reason) => ({ code: reason.code, factId: reason.factId, token: reason.token })),
      gaps: match.gaps.map((gap) => ({ code: gap.code, token: gap.token })),
      unknowns: match.unknowns.map((item) => ({
        code: item.code,
        factId: item.factId ?? null,
        token: item.token ?? null,
      })),
      profileVersion: match.profileVersion,
      opportunityId: match.opportunityId,
      opportunityRevisionId: match.opportunityRevisionId,
      resumeVersionId: match.resumeVersionId,
      createdAt: match.createdAt,
    };
  }

  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }
}

function parseMatch(value: JsonValue): MatchView {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.fit !== 'string') {
    throw new BillingError('not_found');
  }
  const fit = value.fit === 'blocked' || value.fit === 'none' || value.fit === 'partial' || value.fit === 'strong' ? value.fit : 'none';
  return {
    id: value.id,
    fit,
    overlap: typeof value.overlap === 'number' ? value.overlap : 0,
    reasons: reasonsOf(value.reasons),
    gaps: gapsOf(value.gaps),
    unknowns: unknownsOf(value.unknowns),
    profileVersion: typeof value.profileVersion === 'number' ? value.profileVersion : 0,
    opportunityId: typeof value.opportunityId === 'string' ? value.opportunityId : '',
    opportunityRevisionId: typeof value.opportunityRevisionId === 'string' ? value.opportunityRevisionId : '',
    resumeVersionId: typeof value.resumeVersionId === 'string' ? value.resumeVersionId : '',
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
  };
}

function linesOf(body: unknown): Array<{ factId: string; text: string }> {
  if (!isRecord(body) || !Array.isArray(body.sections)) return [];
  const lines: Array<{ factId: string; text: string }> = [];
  for (const section of body.sections) {
    if (!isRecord(section) || !Array.isArray(section.lines)) continue;
    for (const line of section.lines) {
      if (!isRecord(line) || typeof line.factId !== 'string' || typeof line.text !== 'string') continue;
      lines.push({ factId: line.factId, text: line.text });
    }
  }
  return lines;
}

function reasonsOf(value: unknown): MatchExplanation['reasons'] {
  if (!Array.isArray(value)) return [];
  const reasons: MatchExplanation['reasons'] = [];
  for (const item of value) {
    if (!isRecord(item) || item.code !== 'confirmed_overlap' || typeof item.factId !== 'string' || typeof item.token !== 'string') continue;
    reasons.push({ code: 'confirmed_overlap', factId: item.factId, token: item.token });
  }
  return reasons;
}

function gapsOf(value: unknown): MatchExplanation['gaps'] {
  if (!Array.isArray(value)) return [];
  const gaps: MatchExplanation['gaps'] = [];
  for (const item of value) {
    if (!isRecord(item) || item.code !== 'not_in_facts' || typeof item.token !== 'string') continue;
    gaps.push({ code: 'not_in_facts', token: item.token });
  }
  return gaps;
}

function unknownsOf(value: unknown): MatchExplanation['unknowns'] {
  if (!Array.isArray(value)) return [];
  const unknowns: MatchExplanation['unknowns'] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (item.code !== 'pay' && item.code !== 'sponsorship' && item.code !== 'location' && item.code !== 'unconfirmed') continue;
    unknowns.push({
      code: item.code,
      factId: typeof item.factId === 'string' ? item.factId : undefined,
      token: typeof item.token === 'string' ? item.token : undefined,
    });
  }
  return unknowns;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
