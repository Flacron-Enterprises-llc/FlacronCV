import { randomUUID } from 'crypto';
import { CATALOG_VERSION } from '@flacroncv/career-shared';
import type { Principal } from '../identity/identity.service';
import type { TestClock } from './billing-fixture';
import type { TestDatabase } from './test-database';

/**
 * Fictional rows in every table a person owns, for the deletion and export
 * tests. Text fields carry `marker(person)` so a test can tell one person's
 * data from another's in an export.
 */
export function personalDataFixture(db: TestDatabase, clock: TestClock) {
  /** Inserts a row, filling NOT NULL columns without defaults by type. Returns the row. */
  async function seed(table: string, values: Record<string, unknown>): Promise<Record<string, unknown>> {
    const cols = await db.pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 AND is_nullable = 'NO' AND column_default IS NULL`,
      [db.schema, table],
    );
    const row: Record<string, unknown> = { ...values };
    for (const c of cols.rows) {
      if (c.column_name in row) continue;
      row[c.column_name] =
        c.data_type === 'jsonb' ? '{}' : c.data_type === 'uuid' ? randomUUID() : /int|numeric|real/.test(c.data_type) ? 1
        : c.data_type === 'boolean' ? false : /timestamp/.test(c.data_type) ? clock.now() : c.data_type === 'date' ? '2026-12-31'
        : c.data_type === 'ARRAY' ? '{}' : 'x';
    }
    const names = Object.keys(row);
    const res = await db.pool.query(
      `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
      names.map((n) => row[n]),
    );
    return res.rows[0];
  }

  async function listing(owner: Principal | null, title = 'Analyst'): Promise<{ opportunityId: string; revisionId: string }> {
    const o = await seed('opportunities', { category: 'jobs', provider: owner ? 'paste' : 'feed', source_id: randomUUID(), title, organization: 'Northbridge', status: 'open', candidate_auth_user_id: owner?.authUserId ?? null });
    const r = await seed('opportunity_revisions', { opportunity_id: o.id, revision: 1, title, organization: 'Northbridge', status: 'open', description: title });
    await db.pool.query(`UPDATE opportunities SET current_revision_id = $2 WHERE id = $1`, [o.id, r.id]);
    return { opportunityId: o.id as string, revisionId: r.id as string };
  }

  /** One row in every table the person owns. Returns ids a test may need. */
  async function seedEverything(p: Principal) {
    const uid = p.authUserId;
    const ws = p.workspaceId;
    const m = marker(p);
    const own = { workspace_id: ws, candidate_auth_user_id: uid };
    const paste = await listing(p, `Pasted ${m}`);
    const shared = await listing(null);
    const fact = await seed('career_facts', { ...own, fact_type: 'skill', value: JSON.stringify({ name: `SQL ${m}` }), source: 'manual', confirmation: 'confirmed', confirmed_at: clock.now() });
    const resume = await seed('resumes', { ...own, title: `CV ${m}`, language: 'en', template_id: 'classic' });
    const version = await seed('resume_versions', { resume_id: resume.id, version_number: 1, body: JSON.stringify({ note: m }), fact_ids: [fact.id] });
    const letter = await seed('writing_documents', { ...own, document_type: 'cover_letter', title: `Letter ${m}`, body: `Dear team ${m}`, confirmation: 'draft' });
    const app = await seed('applications', { ...own, opportunity_id: shared.opportunityId, opportunity_revision_id: shared.revisionId, resume_version_id: version.id, letter_version_id: letter.id, status: 'saved', notes: `Notes ${m}` });
    await seed('application_reminders', { application_id: app.id, remind_at: clock.now() });
    const interview = await seed('interview_sessions', { ...own, opportunity_id: shared.opportunityId, opportunity_revision_id: shared.revisionId, stage: 'recruiter', title: `Screen ${m}`, questions: '[]' });
    await seed('interview_answers', { session_id: interview.id, question_index: 1, answer: `Answer ${m}` });
    await seed('star_stories', { ...own, situation: `Situation ${m}`, task: 't', action: 'a', result: 'r' });
    const coach = await seed('coaching_threads', { ...own, opportunity_id: paste.opportunityId, title: `Coach ${m}` });
    await seed('coaching_messages', { thread_id: coach.id, position: 1, role: 'user', content: `Question ${m}` });
    await seed('match_results', { ...own, profile_version: 1, opportunity_id: shared.opportunityId, opportunity_revision_id: shared.revisionId, resume_version_id: version.id, fit: 'partial', overlap: 0.5, reasons: JSON.stringify([m]), gaps: '[]', unknowns: '[]' });
    const location = await seed('location_profiles', { ...own, place: `Montréal ${m}`, radius_miles: 25 });
    await seed('saved_searches', { ...own, filters: JSON.stringify({ q: `analyst ${m}` }), location_profile_id: location.id, schedule: 'daily' });
    await seed('followed_companies', { ...own, name: `Northbridge ${m}` });
    await seed('saved_opportunities', { ...own, opportunity_id: paste.opportunityId });
    const careerReminder = await seed('career_reminders', { ...own, kind: 'interview', source_key: `v1:${m}`, title: `Interview ${m}`, due_date: '2026-12-01' });
    await seed('reminder_deliveries', { reminder_id: careerReminder.id, channel: 'email', status: 'pending' });
    await db.pool.query(`INSERT INTO alert_settings (candidate_auth_user_id, workspace_id) VALUES ($1, $2)`, [uid, ws]);
    const ledger = await seed('usage_ledger', { billing_account_id: p.billingAccountId, workspace_id: ws, candidate_auth_user_id: uid, unit: 'alert_item', quantity: 1, request_id: randomUUID(), idempotency_key: `secret-key-${randomUUID()}`, request_fingerprint: 'f', allowance_period_start: clock.now(), state: 'reserved' });
    const item = await seed('alert_items', { ledger_id: ledger.id, workspace_id: ws, opportunity_id: shared.opportunityId, recipient_auth_user_id: uid, material_revision_id: shared.revisionId, reason: JSON.stringify({ code: 'new_listing', note: m }) });
    await seed('notification_deliveries', { alert_item_id: item.id, channel: 'email', status: 'sent' });
    await seed('digests', { recipient_auth_user_id: uid, period_start: clock.now(), channel: 'email' });
    await seed('action_packs', { ...own, opportunity_id: paste.opportunityId, opportunity_revision_id: paste.revisionId, fit: JSON.stringify({ note: m }) });
    await seed('skill_gap_reports', { ...own, target_role: `Analyst ${m}` });
    await seed('candidate_specialist_modes', { ...own, mode: 'veterans', modes: JSON.stringify(['veterans']), custom_guidelines: `Guidelines ${m}` });
    const voice = await seed('voice_interview_sessions', { ...own, kind: 'practice', opportunity_id: paste.opportunityId, title: `Voice ${m}`, prompt: 'p' });
    await seed('voice_audio_records', { session_id: voice.id, billing_account_id: p.billingAccountId, idempotency_key: `secret-key-${randomUUID()}`, request_fingerprint: 'f', duration_seconds: 30, requested_seconds: 30, transcript: `Transcript ${m}`, audio_object_key: `voice/secret-object-${randomUUID()}.m4a` });
    await seed('recording_consents', { ...own, consent_version: 'v1' });
    await seed('career_scenarios', { ...own, options: JSON.stringify([m]), tradeoff: `Tradeoff ${m}` });
    await seed('assisted_form_sessions', { ...own, site: 'example-jobs.test' });
    await seed('map_sessions', { ...own, minutes: 15 });
    await seed('career_achievements', { ...own, title: `Award ${m}` });
    await seed('career_promotion_goals', { ...own, desired_title: `Lead ${m}` });
    await seed('credential_reminders', { ...own, name: `PMP ${m}` });
    await seed('opportunity_reports', { ...own, opportunity_id: shared.opportunityId, reason: 'other', notes: `Report ${m}`, status: 'pending' });
    await seed('recruiting_opt_ins', { ...own, discoverable: true });
    const portfolio = await seed('portfolios', { ...own, slug: randomUUID().replace(/-/g, '').slice(0, 12), title: `Work ${m}`, locale: 'en', visibility: 'private', share_token: `share-secret-${randomUUID()}`, contact_email: `${uid}@example.test` });
    const evidence = await seed('career_evidence', { ...own, title: `Sample ${m}`, evidence_type: 'project' });
    await seed('portfolio_evidence', { portfolio_id: portfolio.id, evidence_id: evidence.id, position: 0, case_study: `Case ${m}` });
    await seed('evidence_verifications', {
      evidence_id: evidence.id, label: 'issuer_verified', method: 'issuer_registry', checked_on: '2026-10-01',
      scope: `Scope ${m}`, issuer_name: `Issuer ${m}`, permission_evidence: `Consent ${m}`,
    });
    await seed('career_profiles', { ...own, version: 1, preferences: JSON.stringify({ note: m }) });
    await seed('resume_imports', { ...own, file_name: `cv-${m}.pdf`, format: 'pdf', text_sha256: 'a'.repeat(64), char_count: 10, fact_count: 1 });
    await seed('import_daily_counts', { auth_user_id: uid, usage_date: '2026-10-24', count: 1, pending: 0 });
    await seed('ai_jobs', { ledger_id: ledger.id, billing_account_id: p.billingAccountId, workspace_id: ws, owner_auth_user_id: uid, kind: 'test', unit: 'document_credit', idempotency_key: `secret-key-${randomUUID()}`, status: 'succeeded', input_versions: '{}', result: JSON.stringify({ note: m }), finished_at: clock.now() });
    await seed('estimates', { billing_account_id: p.billingAccountId, catalog_version: CATALOG_VERSION, plan_id: 'starter', interval: 'monthly', body: '{}', result: '{}', expires_at: clock.now() });
    await seed('api_keys', { workspace_id: ws, billing_account_id: p.billingAccountId, key_hash: `hash-secret-${randomUUID()}`, key_prefix: 'flc_x' });
    await seed('white_label_configs', { workspace_id: ws, brand_name: `Brand ${m}`, attribution: 'Powered by FlacronCV' });
    const staff = await seed('business_staff', { workspace_id: ws, auth_user_id: uid, role: 'manager', accepted_at: clock.now() });
    const invitee = await seed('business_candidates', { workspace_id: ws, email: `invitee-of-${uid}@example.test`, consent: true });
    await seed('business_assignments', { staff_id: staff.id, candidate_id: invitee.id });
    await seed('business_staff', { workspace_id: ws, role: 'counselor', invite_email: `staff-invite-of-${uid}@example.test`, invite_token_hash: `hash-secret-${randomUUID()}`, invite_expires_at: clock.now() });
    await seed('business_queue_items', { workspace_id: ws, title: `Queue ${m}`, note: `Note ${m}` });
    await seed('business_queue_items', { workspace_id: ws, title: `For invitee ${m}`, candidate_id: invitee.id, status: 'recommended' });
    await seed('admin_audit', { actor_auth_user_id: uid, action: 'flag.set', target: 'evidenceItems' });
    await db.pool.query(
      `INSERT INTO legal_acceptances (user_id, auth_user_id, terms_accepted, privacy_accepted, disclaimer_accepted, terms_version, privacy_version, disclaimer_version, accepted_at)
       VALUES ($1, $2, true, true, true, 'v', 'v', 'v', $3)`,
      [p.userId, uid, clock.now()],
    );
    return { evidenceId: evidence.id as string, portfolioId: portfolio.id as string, sharedOpportunityId: shared.opportunityId };
  }

  return { seed, listing, seedEverything };
}

/** A string every seeded text field of this person carries. */
export function marker(p: Pick<Principal, 'authUserId'>): string {
  return `mark-${p.authUserId}`;
}
