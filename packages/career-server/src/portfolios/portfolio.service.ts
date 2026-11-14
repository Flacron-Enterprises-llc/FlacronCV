import { randomBytes, timingSafeEqual } from 'crypto';
import type { Pool } from 'pg';
import {
  CASE_STUDY_MAX,
  portfolioPath,
  portfolioSections,
  type CreatePortfolioInput,
  type PortfolioItem,
  type PortfolioPage,
  type PortfolioQr,
  type PublicPortfolioView,
  type UpdatePortfolioInput,
} from '@flacroncv/career-shared';
import { readAccount, v2PlanOf } from '../billing/accounts';
import type { Clock } from '../billing/billing.service';
import { CatalogStore } from '../billing/catalog';
import { withTransaction } from '../billing/db';
import { BillingError } from '../billing/errors';
import { WindowRateLimit } from '../http/rate-limit';
import type { Principal } from '../identity/identity.service';
import { capacityLimit, checkCapacity, isFeatureEnabled, requireFeature } from '../metering/access';
import { isBillingError } from '../billing/errors';
import type { EvidenceLabel } from '@flacroncv/career-shared';
import { shownLabel, verificationsFor } from '../evidence/evidence.service';
import { qrSvg } from './qr';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-f0-9]{12}$/;

interface PortfolioRow {
  id: string;
  workspace_id: string;
  candidate_auth_user_id: string;
  slug: string;
  title: string;
  headline: string;
  display_name: string;
  locale: 'en' | 'fr';
  visibility: 'draft' | 'private' | 'public';
  show_email: boolean;
  show_phone: boolean;
  contact_email: string | null;
  contact_phone: string | null;
  share_token: string | null;
  sections: unknown;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class PortfolioService {
  private readonly catalogs = new CatalogStore();
  private readonly visitLimit = new WindowRateLimit(120, 60_000);

  constructor(
    private readonly pool: Pool,
    private readonly clock: Clock = { now: () => new Date() },
  ) {}

  async list(owner: Principal): Promise<{ items: PortfolioPage[] }> {
    await this.requirePortfolioFeature(owner);
    const rows = await this.pool.query<PortfolioRow>(
      `SELECT * FROM portfolios
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2
        ORDER BY updated_at DESC, id`,
      [owner.workspaceId, owner.authUserId],
    );
    const items: PortfolioPage[] = [];
    for (const row of rows.rows) items.push(await this.toPage(owner, row));
    return { items };
  }

  async get(owner: Principal, portfolioId: string): Promise<PortfolioPage> {
    await this.requirePortfolioFeature(owner);
    return this.toPage(owner, await this.owned(owner, portfolioId));
  }

  async create(owner: Principal, input: CreatePortfolioInput): Promise<PortfolioPage> {
    const title = clean(input.title, 120, true);
    if (!title) throw new BillingError('validation_error', { field: 'title', reason: 'invalid' });
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    await requireFeature(this.pool, snapshot, 'portfolioPages');
    const used = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM portfolios WHERE workspace_id = $1 AND candidate_auth_user_id = $2`,
      [owner.workspaceId, owner.authUserId],
    );
    checkCapacity(snapshot, account, 'portfolioPages', used.rows[0]?.n ?? 0, 1);
    const locale = input.locale === 'fr' || input.locale === 'en' ? input.locale : owner.locale === 'fr' ? 'fr' : 'en';
    const slug = await this.freshSlug();
    const inserted = await this.pool.query<{ id: string }>(
      `INSERT INTO portfolios
         (workspace_id, candidate_auth_user_id, slug, title, headline, display_name, locale, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING id`,
      [
        owner.workspaceId,
        owner.authUserId,
        slug,
        title,
        clean(input.headline, 280, false),
        clean(input.displayName, 120, false),
        locale,
        this.clock.now(),
      ],
    );
    return this.get(owner, inserted.rows[0].id);
  }

  async update(owner: Principal, portfolioId: string, input: UpdatePortfolioInput): Promise<PortfolioPage> {
    const current = await this.owned(owner, portfolioId);
    await this.requirePortfolioFeature(owner);
    const title = input.title === undefined ? current.title : clean(input.title, 120, true);
    if (!title) throw new BillingError('validation_error', { field: 'title', reason: 'invalid' });
    const locale = input.locale === undefined ? current.locale : input.locale;
    if (locale !== 'en' && locale !== 'fr') throw new BillingError('validation_error', { field: 'locale', reason: 'invalid' });
    const evidenceIds = input.evidenceIds === undefined ? null : uniqueIds(input.evidenceIds);
    const sections = input.sections === undefined ? null : portfolioSections({ ...portfolioSections(current.sections), ...input.sections });
    const caseStudies = input.caseStudies === undefined ? null : cleanCaseStudies(input.caseStudies);
    await withTransaction(this.pool, async (db) => {
      await db.query(
        `UPDATE portfolios
            SET title = $2, headline = $3, display_name = $4, locale = $5,
                show_email = $6, show_phone = $7, contact_email = $8, contact_phone = $9, updated_at = $10
          WHERE id = $1`,
        [
          current.id,
          title,
          input.headline === undefined ? current.headline : clean(input.headline, 280, false),
          input.displayName === undefined ? current.display_name : clean(input.displayName, 120, false),
          locale,
          input.showEmail === undefined ? current.show_email : input.showEmail,
          input.showPhone === undefined ? current.show_phone : input.showPhone,
          input.contactEmail === undefined ? current.contact_email : optionalContact(input.contactEmail, 200, 'contactEmail'),
          input.contactPhone === undefined ? current.contact_phone : optionalContact(input.contactPhone, 40, 'contactPhone'),
          this.clock.now(),
        ],
      );
      if (sections) {
        await db.query(`UPDATE portfolios SET sections = $2 WHERE id = $1`, [current.id, JSON.stringify(sections)]);
      }
      if (evidenceIds) {
        await this.replaceEvidence(db, owner, current.id, evidenceIds);
      }
      if (caseStudies) {
        const onPage = await db.query<{ evidence_id: string }>(`SELECT evidence_id FROM portfolio_evidence WHERE portfolio_id = $1`, [current.id]);
        const ids = new Set(onPage.rows.map((row) => row.evidence_id));
        for (const evidenceId of Object.keys(caseStudies)) {
          if (!ids.has(evidenceId)) throw new BillingError('validation_error', { field: 'caseStudies', reason: 'not_on_page' });
        }
        for (const [evidenceId, text] of Object.entries(caseStudies)) {
          await db.query(`UPDATE portfolio_evidence SET case_study = $3 WHERE portfolio_id = $1 AND evidence_id = $2`, [current.id, evidenceId, text]);
        }
      }
    });
    return this.get(owner, current.id);
  }

  async publish(owner: Principal, portfolioId: string, visibility: 'public' | 'private'): Promise<PortfolioPage> {
    const current = await this.owned(owner, portfolioId);
    await this.requirePortfolioFeature(owner);
    // Re-publishing a private page keeps its link working: a printed QR code must not break.
    // Only "revoke" replaces the token.
    const token = visibility === 'private' ? current.share_token ?? randomBytes(24).toString('base64url') : null;
    await this.pool.query(
      `UPDATE portfolios
          SET visibility = $2, share_token = $3, published_at = $4, updated_at = $4
        WHERE id = $1`,
      [current.id, visibility, token, this.clock.now()],
    );
    return this.get(owner, current.id);
  }

  async unpublish(owner: Principal, portfolioId: string): Promise<PortfolioPage> {
    const current = await this.owned(owner, portfolioId);
    await this.requirePortfolioFeature(owner);
    await this.pool.query(
      `UPDATE portfolios
          SET visibility = 'draft', share_token = NULL, published_at = NULL, updated_at = $2
        WHERE id = $1`,
      [current.id, this.clock.now()],
    );
    return this.get(owner, current.id);
  }

  /**
   * Deletes a page and its evidence links and visit counts (cascade). The
   * slug stops resolving at once. Not behind the feature switch: a person
   * can always remove a page they published.
   */
  async remove(owner: Principal, portfolioId: string): Promise<{ ok: true }> {
    const current = await this.owned(owner, portfolioId);
    await this.pool.query(`DELETE FROM portfolios WHERE id = $1`, [current.id]);
    return { ok: true };
  }

  async revoke(owner: Principal, portfolioId: string): Promise<PortfolioPage> {
    const current = await this.owned(owner, portfolioId);
    await this.requirePortfolioFeature(owner);
    if (current.visibility !== 'private') {
      throw new BillingError('validation_error', { field: 'visibility', reason: 'not_private' });
    }
    await this.pool.query(
      `UPDATE portfolios SET share_token = $2, updated_at = $3 WHERE id = $1`,
      [current.id, randomBytes(24).toString('base64url'), this.clock.now()],
    );
    return this.get(owner, current.id);
  }

  async qr(owner: Principal, portfolioId: string, origin: string): Promise<PortfolioQr> {
    const page = await this.get(owner, portfolioId);
    if (page.visibility === 'draft') {
      throw new BillingError('validation_error', { field: 'visibility', reason: 'unpublished' });
    }
    const path = portfolioPath(page.locale, page.slug, page.visibility === 'private' ? page.shareToken : null);
    const svg = await qrSvg(`${safeOrigin(origin)}${path}`);
    return { svg, path };
  }

  async readPublic(slug: string, token?: string | null): Promise<PublicPortfolioView> {
    if (!SLUG.test(slug)) throw new BillingError('not_found');
    const rows = await this.pool.query<PortfolioRow>(`SELECT * FROM portfolios WHERE slug = $1`, [slug]);
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.visibility !== 'draft' && !(await this.withinPlan(row))) throw new BillingError('not_found');
    if (row.visibility === 'public') {
      await this.countVisit(row.id);
      return this.toPublic(row);
    }
    if (row.visibility === 'private' && token && row.share_token && sameToken(token, row.share_token)) {
      await this.countVisit(row.id);
      return this.toPublic(row);
    }
    throw new BillingError('not_found');
  }

  /**
   * A published page is served only while the owner's current plan still
   * covers it: the feature switch is on, the plan includes pages, and the page
   * is among the oldest N published pages (N = plan pages + purchased extras).
   * After a downgrade the newest pages stop resolving until the owner
   * unpublishes others or upgrades; nothing is deleted.
   */
  private async withinPlan(row: PortfolioRow): Promise<boolean> {
    const accounts = await this.pool.query<{ id: string }>(`SELECT id FROM billing_accounts WHERE workspace_id = $1`, [row.workspace_id]);
    const accountId = accounts.rows[0]?.id;
    if (!accountId) return false;
    const account = await readAccount(this.pool, accountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    if (!(await isFeatureEnabled(this.pool, snapshot, 'portfolioPages'))) return false;
    let allowed: number | null;
    try {
      // Plan pages plus recurring "extra page" add-ons.
      allowed = capacityLimit(snapshot, account, 'portfolioPages');
    } catch (error) {
      if (!isBillingError(error, 'not_found')) throw error;
      return false;
    }
    if (allowed === null) return false;
    const rank = await this.pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM portfolios
        WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND visibility <> 'draft'
          AND (published_at, id) <= ($3::timestamptz, $4::uuid)`,
      [row.workspace_id, row.candidate_auth_user_id, row.published_at ?? new Date(0), row.id],
    );
    return Number(rank.rows[0]?.n ?? 0) <= allowed;
  }

  private async toPage(owner: Principal, row: PortfolioRow): Promise<PortfolioPage> {
    const links = await this.pool.query<{ evidence_id: string; case_study: string }>(
      `SELECT evidence_id, case_study FROM portfolio_evidence WHERE portfolio_id = $1 ORDER BY position, evidence_id`,
      [row.id],
    );
    const caseStudies: Record<string, string> = {};
    for (const link of links.rows) if (link.case_study) caseStudies[link.evidence_id] = link.case_study;
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      headline: row.headline,
      displayName: row.display_name,
      locale: row.locale,
      visibility: row.visibility,
      showEmail: row.show_email,
      showPhone: row.show_phone,
      contactEmail: row.contact_email,
      contactPhone: row.contact_phone,
      evidenceIds: links.rows.map((link) => link.evidence_id),
      sections: portfolioSections(row.sections),
      caseStudies,
      shareToken: row.share_token,
      publishedAt: row.published_at ? row.published_at.toISOString() : null,
      visitCount: await this.visitCount(owner, row.id),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async toPublic(row: PortfolioRow): Promise<PublicPortfolioView> {
    const sections = portfolioSections(row.sections);
    const items = sections.evidence || sections.skills
      ? await this.pool.query<{
          id: string;
          title: string;
          description: string;
          evidence_type: string;
          evidence_label: EvidenceLabel;
          attachment_url: string | null;
          attachment_object_key: string | null;
          linked_skills: unknown;
          case_study: string;
        }>(
          `SELECT e.id, e.title, e.description, e.evidence_type, e.evidence_label, e.attachment_url,
                  e.attachment_object_key, e.linked_skills, pe.case_study
             FROM portfolio_evidence pe
             JOIN career_evidence e ON e.id = pe.evidence_id
            WHERE pe.portfolio_id = $1
              -- Only evidence the owner marked "share on portfolio" is ever public;
              -- linking an item to a page is not consent to publish it.
              AND e.is_portfolio_shared = TRUE
              -- Confidential material only after the owner confirmed its redaction.
              AND (e.confidential = FALSE OR e.redaction_confirmed_at IS NOT NULL)
            ORDER BY pe.position, e.id`,
          [row.id],
        )
      : { rows: [] };
    const today = this.clock.now().toISOString().slice(0, 10);
    const checks = await verificationsFor(this.pool, items.rows.map((item) => item.id), today);
    const shown = items.rows.map((item): PortfolioItem => ({
      id: item.id,
      title: item.title,
      description: item.description,
      evidenceType: item.evidence_type,
      // The label as of today: an expired or revoked check no longer counts.
      evidenceLabel: shownLabel(item, checks.get(item.id) ?? [], today),
      linkedSkills: Array.isArray(item.linked_skills) ? item.linked_skills.filter((skill): skill is string => typeof skill === 'string') : [],
      caseStudy: item.case_study ?? '',
    }));
    const skills: string[] = [];
    if (sections.skills) {
      for (const item of shown) for (const skill of item.linkedSkills) if (!skills.includes(skill)) skills.push(skill);
    }
    return {
      slug: row.slug,
      title: row.title,
      headline: sections.summary ? row.headline : '',
      displayName: row.display_name,
      items: sections.evidence ? shown : [],
      skills,
      sections,
      contactEmail: sections.contact && row.show_email ? row.contact_email : null,
      contactPhone: sections.contact && row.show_phone ? row.contact_phone : null,
    };
  }

  private async visitCount(owner: Principal, portfolioId: string): Promise<number | null> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    if (snapshot.allowances[v2PlanOf(snapshot, account)].portfolioAnalytics === 'none') return null;
    const rows = await this.pool.query<{ views: string }>(
      `SELECT COALESCE(sum(views), 0)::text AS views FROM portfolio_visit_days WHERE portfolio_id = $1`,
      [portfolioId],
    );
    return parseInt(rows.rows[0]?.views ?? '0', 10);
  }

  private async countVisit(portfolioId: string): Promise<void> {
    const gate = this.visitLimit.take(`portfolio:${portfolioId}`, this.clock.now());
    if (!gate.allowed) return;
    const day = this.clock.now().toISOString().slice(0, 10);
    await this.pool.query(
      `INSERT INTO portfolio_visit_days (portfolio_id, visited_on, views)
       VALUES ($1, $2, 1)
       ON CONFLICT (portfolio_id, visited_on)
       DO UPDATE SET views = portfolio_visit_days.views + 1`,
      [portfolioId, day],
    );
  }

  private async owned(owner: Principal, portfolioId: string): Promise<PortfolioRow> {
    if (!UUID.test(portfolioId)) throw new BillingError('not_found');
    const rows = await this.pool.query<PortfolioRow>(`SELECT * FROM portfolios WHERE id = $1`, [portfolioId]);
    const row = rows.rows[0];
    if (!row) throw new BillingError('not_found');
    if (row.workspace_id !== owner.workspaceId || row.candidate_auth_user_id !== owner.authUserId) {
      throw new BillingError('permission_denied');
    }
    return row;
  }

  private async requirePortfolioFeature(owner: Principal): Promise<void> {
    const account = await readAccount(this.pool, owner.billingAccountId);
    const snapshot = await this.catalogs.get(this.pool, account.catalog_version);
    await requireFeature(this.pool, snapshot, 'portfolioPages');
  }

  private async replaceEvidence(
    db: { query: Pool['query'] },
    owner: Principal,
    portfolioId: string,
    evidenceIds: string[],
  ): Promise<void> {
    if (evidenceIds.length > 50) throw new BillingError('validation_error', { field: 'evidenceIds', reason: 'too_many' });
    if (evidenceIds.length > 0) {
      const found = await db.query(
        `SELECT id FROM career_evidence
          WHERE workspace_id = $1 AND candidate_auth_user_id = $2 AND id = ANY($3::uuid[])`,
        [owner.workspaceId, owner.authUserId, evidenceIds],
      );
      if (found.rows.length !== evidenceIds.length) {
        throw new BillingError('validation_error', { field: 'evidenceIds', reason: 'unknown' });
      }
    }
    // Items that stay keep their case-study text; only removed items lose it.
    await db.query(`DELETE FROM portfolio_evidence WHERE portfolio_id = $1 AND NOT (evidence_id = ANY($2::uuid[]))`, [portfolioId, evidenceIds]);
    for (let position = 0; position < evidenceIds.length; position += 1) {
      await db.query(
        `INSERT INTO portfolio_evidence (portfolio_id, evidence_id, position) VALUES ($1, $2, $3)
         ON CONFLICT (portfolio_id, evidence_id) DO UPDATE SET position = EXCLUDED.position`,
        [portfolioId, evidenceIds[position], position],
      );
    }
  }

  private async freshSlug(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = randomBytes(6).toString('hex');
      const existing = await this.pool.query(`SELECT 1 FROM portfolios WHERE slug = $1`, [slug]);
      if (!existing.rows[0]) return slug;
    }
    throw new BillingError('validation_error', { field: 'slug', reason: 'unavailable' });
  }
}

function clean(value: string | undefined, max: number, required: boolean): string {
  const text = value?.trim() ?? '';
  if (text.length > max) throw new BillingError('validation_error', { field: 'text', reason: 'too_long' });
  if (required && text.length === 0) return '';
  return text;
}

function cleanCaseStudies(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BillingError('validation_error', { field: 'caseStudies', reason: 'invalid' });
  }
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(value as Record<string, unknown>)) {
    if (!UUID.test(id) || typeof text !== 'string') throw new BillingError('validation_error', { field: 'caseStudies', reason: 'invalid' });
    const clean = text.trim();
    if (clean.length > CASE_STUDY_MAX) throw new BillingError('validation_error', { field: 'caseStudies', reason: 'too_long' });
    out[id] = clean;
  }
  return out;
}

function optionalContact(value: string | null, max: number, field: string): string | null {
  if (value === null) return null;
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.length > max || /[\r\n]/.test(text)) {
    throw new BillingError('validation_error', { field, reason: 'invalid' });
  }
  return text;
}

function uniqueIds(values: string[]): string[] {
  const ids: string[] = [];
  for (const value of values) {
    if (!UUID.test(value)) throw new BillingError('validation_error', { field: 'evidenceIds', reason: 'invalid' });
    if (!ids.includes(value)) ids.push(value);
  }
  return ids;
}

function sameToken(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function safeOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new BillingError('validation_error', { field: 'origin', reason: 'invalid' });
  }
  if (url.username || url.password || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new BillingError('validation_error', { field: 'origin', reason: 'invalid' });
  }
  return url.origin;
}
