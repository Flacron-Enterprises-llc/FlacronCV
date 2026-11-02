import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import {
  DEFAULT_RESUME_TEMPLATE,
  composeResume,
  defaultActionPackChecklist,
  defaultActionPackNextSteps,
  explainMatch,
  isFactType,
  resumeFactIds,
  writingBody,
} from '@flacroncv/career-shared';
import type {
  ActionPack,
  ActionPackChecklistItem,
  ActionPackFit,
  ActionPackLetter,
  ActionPackProfileFactSnapshot,
  ActionPackResume,
  ActionPackVacancySnapshot,
  MatchLine,
  MatchListing,
  ResumeFactInput,
} from '@flacroncv/career-shared';
import { readAccount } from '../billing/accounts';
import { CatalogStore } from '../billing/catalog';
import { unitBalance } from '../billing/entitlements';
import { BillingError, isBillingError } from '../billing/errors';
import type { JsonValue, MeteredResult } from '../metering/metering.service';
import { MeteringService } from '../metering/metering.service';
import type { ProfileOwner } from '../profile/career-profile.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface ActionPackRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  opportunity_id: string;
  opportunity_revision_id: string;
  vacancy_snapshot: ActionPackVacancySnapshot;
  profile_snapshot: ActionPackProfileFactSnapshot[];
  fit: ActionPackFit;
  tailored_resume: ActionPackResume;
  cover_letter: ActionPackLetter;
  checklist: ActionPackChecklistItem[];
  next_steps: string[];
  created_at: Date;
  updated_at: Date;
}

export interface ActionPackBalanceView {
  includedRemaining: number;
  packRemaining: number;
  renewalDate: string | null;
}

export interface ActionPackList {
  items: ActionPack[];
  actionPack: ActionPackBalanceView;
}

interface ListingRow {
  opportunity_id: string;
  revision_id: string;
  title: string;
  organization: string;
  description: string;
  source_url: string | null;
  deadline: string | null;
  locations: string[];
  eligibility: Record<string, unknown>;
  compensation: Record<string, unknown>;
  status: 'open' | 'closed';
  checked_at: Date;
}

export class ActionEngineService {
  private readonly catalogs = new CatalogStore();

  constructor(
    private readonly pool: Pool,
    private readonly metering: MeteringService,
  ) {}

  async list(owner: ProfileOwner): Promise<ActionPackList> {
    const rows = await this.pool.query<ActionPackRow>(
      `SELECT id, workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id,
              vacancy_snapshot, profile_snapshot, fit, tailored_resume, cover_letter,
              checklist, next_steps, created_at, updated_at
         FROM action_packs
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at DESC, id`,
      [owner.workspaceId, owner.authUserId],
    );
    return {
      items: rows.rows.map((row) => this.view(row)),
      actionPack: await this.actionPackBalance(owner),
    };
  }

  async get(owner: ProfileOwner, id: string): Promise<ActionPack> {
    const row = await this.load(this.pool, owner, id);
    return this.view(row);
  }

  async create(
    owner: ProfileOwner,
    input: { opportunityId?: string },
    idempotencyKey?: string,
  ): Promise<MeteredResult<JsonValue>> {
    const opportunityId = typeof input?.opportunityId === 'string' ? input.opportunityId : '';
    if (!UUID.test(opportunityId)) {
      throw new BillingError('validation_error', { field: 'opportunityId', reason: 'invalid_uuid' });
    }

    const listing = await this.loadListing(opportunityId);
    const facts = await this.loadFacts(owner);
    const confirmedFacts = facts.filter((f) => f.confirmation === 'confirmed');
    if (confirmedFacts.length === 0) {
      throw new BillingError('validation_error', { field: 'facts', reason: 'no_confirmed_facts' });
    }

    return this.metering.run<ActionPackRow, JsonValue>({
      spender: owner,
      kind: 'action_engine.bundle',
      unit: 'action_pack',
      feature: 'actionPacks',
      idempotencyKey,
      body: { opportunityId },
      requestId: randomUUID(),
      provenance: {
        promptTemplateVersion: 'action-engine@2026-10-10',
        outputSchemaVersion: 'action-pack@1',
        inputVersions: {
          opportunityRevisionId: listing.revision_id,
          profileFactCount: confirmedFacts.length,
        },
      },
      execute: async () => {
        // 1. Calculate explainable match and skill gaps
        const matchLines: MatchLine[] = confirmedFacts.map((f) => ({
          factId: f.id,
          text: JSON.stringify(f.value),
          confirmed: true,
        }));
        const matchListing: MatchListing = {
          status: listing.status,
          deadline: listing.deadline,
          title: listing.title,
          description: listing.description,
          locations: Array.isArray(listing.locations) ? listing.locations : [],
          payKnown: Object.keys(listing.compensation ?? {}).length > 0,
          sponsorship: 'unknown',
        };
        const today = new Date().toISOString().slice(0, 10);
        const explanation = explainMatch(matchListing, matchLines, today);

        const fit: ActionPackFit = {
          fit: explanation.fit,
          overlap: explanation.overlap,
          reasons: explanation.reasons.map((r) => `Confirmed experience matching ${r.token}`),
          gaps: explanation.gaps.map((g) => `Missing direct evidence for ${g.token}`),
          unknowns: explanation.unknowns.map((u) => u.code),
        };

        // 2. Compose Tailored Resume Lines
        const resumeBody = composeResume(confirmedFacts, DEFAULT_RESUME_TEMPLATE);
        const tailoredResume: ActionPackResume = {
          title: `Tailored Resume - ${listing.title}`,
          lines: resumeBody.sections.flatMap((s) => s.lines),
          factIds: resumeFactIds(resumeBody),
        };

        // 3. Compose Grounded Cover Letter
        const letterContent = writingBody(confirmedFacts);
        const intro = `Dear Hiring Team at ${listing.organization || 'the company'},\n\nI am writing to express my strong interest in the ${listing.title} position.`;
        const bodyText = letterContent.body.length > 0
          ? `${intro}\n\n${letterContent.body}\n\nI look forward to discussing how my experience aligns with your team's goals.\n\nSincerely,\nCandidate`
          : `${intro}\n\nBased on my confirmed background, I look forward to contributing to your engineering objectives.\n\nSincerely,\nCandidate`;
        const coverLetter: ActionPackLetter = {
          title: `Cover Letter - ${listing.title} at ${listing.organization}`,
          body: bodyText,
          factIds: letterContent.factIds.length > 0 ? letterContent.factIds : confirmedFacts.map((f) => f.id),
        };

        // 4. Preparation Checklist
        const checklist = defaultActionPackChecklist(listing.title, listing.organization);

        // 5. Next Steps
        const nextSteps = defaultActionPackNextSteps(fit.fit, fit.gaps.length);

        // 6. Freeze Snapshots
        const vacancySnapshot: ActionPackVacancySnapshot = {
          title: listing.title,
          organization: listing.organization,
          description: listing.description,
          sourceUrl: listing.source_url,
          deadline: listing.deadline,
          checkedAt: listing.checked_at.toISOString(),
          revisionId: listing.revision_id,
        };

        const profileSnapshot: ActionPackProfileFactSnapshot[] = confirmedFacts.map((f) => ({
          id: f.id,
          factType: f.factType,
          value: f.value,
        }));

        return {
          id: randomUUID(),
          workspace_id: owner.workspaceId,
          candidate_auth_user_id: owner.authUserId,
          opportunity_id: listing.opportunity_id,
          opportunity_revision_id: listing.revision_id,
          vacancy_snapshot: vacancySnapshot,
          profile_snapshot: profileSnapshot,
          fit,
          tailored_resume: tailoredResume,
          cover_letter: coverLetter,
          checklist,
          next_steps: nextSteps,
          created_at: new Date(),
          updated_at: new Date(),
        };
      },
      save: async (db, generated) => {
        const res = await db.query<ActionPackRow>(
          `INSERT INTO action_packs
             (workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id,
              vacancy_snapshot, profile_snapshot, fit, tailored_resume, cover_letter,
              checklist, next_steps, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
           RETURNING id, workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id,
                     vacancy_snapshot, profile_snapshot, fit, tailored_resume, cover_letter,
                     checklist, next_steps, created_at, updated_at`,
          [
            owner.workspaceId,
            owner.authUserId,
            generated.opportunity_id,
            generated.opportunity_revision_id,
            JSON.stringify(generated.vacancy_snapshot),
            JSON.stringify(generated.profile_snapshot),
            JSON.stringify(generated.fit),
            JSON.stringify(generated.tailored_resume),
            JSON.stringify(generated.cover_letter),
            JSON.stringify(generated.checklist),
            JSON.stringify(generated.next_steps),
          ],
        );
        return this.view(res.rows[0]) as unknown as JsonValue;
      },
    });
  }

  async updateChecklist(
    owner: ProfileOwner,
    id: string,
    checklistId: string,
    done: boolean,
  ): Promise<ActionPack> {
    const current = await this.load(this.pool, owner, id);
    const updatedChecklist = current.checklist.map((item) =>
      item.id === checklistId ? { ...item, done } : item,
    );

    const res = await this.pool.query<ActionPackRow>(
      `UPDATE action_packs
          SET checklist = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id,
                  vacancy_snapshot, profile_snapshot, fit, tailored_resume, cover_letter,
                  checklist, next_steps, created_at, updated_at`,
      [current.id, JSON.stringify(updatedChecklist)],
    );
    return this.view(res.rows[0]);
  }

  private async load(db: Pool, owner: ProfileOwner, id: string): Promise<ActionPackRow> {
    if (!UUID.test(id)) throw new BillingError('not_found');
    const rows = await db.query<ActionPackRow>(
      `SELECT id, workspace_id, candidate_auth_user_id, opportunity_id, opportunity_revision_id,
              vacancy_snapshot, profile_snapshot, fit, tailored_resume, cover_letter,
              checklist, next_steps, created_at, updated_at
         FROM action_packs
        WHERE id = $1`,
      [id],
    );
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private async loadListing(opportunityId: string): Promise<ListingRow> {
    const res = await this.pool.query<ListingRow>(
      `SELECT o.id AS opportunity_id, r.id AS revision_id, r.title, r.organization, r.description,
              r.source_url, r.deadline, r.locations, r.eligibility, r.compensation, r.status, r.checked_at
         FROM opportunities o
         JOIN opportunity_revisions r ON r.id = o.current_revision_id
        WHERE o.id = $1`,
      [opportunityId],
    );
    const row = res.rows[0];
    if (!row) throw new BillingError('not_found', { opportunityId });
    return row;
  }

  private async loadFacts(owner: ProfileOwner): Promise<ResumeFactInput[]> {
    const rows = await this.pool.query<{
      id: string;
      fact_type: string;
      value: unknown;
      confirmation: string;
    }>(
      `SELECT id, fact_type, value, confirmation
         FROM career_facts
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY created_at, id`,
      [owner.workspaceId, owner.authUserId],
    );
    const facts: ResumeFactInput[] = [];
    for (const row of rows.rows) {
      if (!isFactType(row.fact_type) || !isRecord(row.value)) continue;
      facts.push({
        id: row.id,
        factType: row.fact_type,
        value: row.value,
        confirmation: row.confirmation === 'confirmed' ? 'confirmed' : 'draft',
        uncertain: {},
      });
    }
    return facts;
  }

  private async actionPackBalance(owner: ProfileOwner): Promise<ActionPackBalanceView> {
    try {
      const account = await readAccount(this.pool, owner.billingAccountId);
      const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
      const balance = await unitBalance(this.pool, account, snapshot, 'action_pack', new Date());
      return {
        includedRemaining: balance.includedRemaining,
        packRemaining: balance.packRemaining,
        renewalDate: balance.renewalDate.toISOString(),
      };
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      return { includedRemaining: 0, packRemaining: 0, renewalDate: null };
    }
  }

  private view(row: ActionPackRow): ActionPack {
    return {
      id: row.id,
      opportunityId: row.opportunity_id,
      opportunityRevisionId: row.opportunity_revision_id,
      vacancySnapshot: row.vacancy_snapshot,
      profileSnapshot: row.profile_snapshot,
      fit: row.fit,
      tailoredResume: row.tailored_resume,
      coverLetter: row.cover_letter,
      checklist: row.checklist,
      nextSteps: row.next_steps,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    };
  }
}
