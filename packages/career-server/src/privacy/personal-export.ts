import type { Db } from '../billing/db';
import type { Principal } from '../identity/identity.service';

/** Bumped when the shape of the export changes. */
export const EXPORT_FORMAT_VERSION = 2;

/**
 * Where each personal table appears in the export. Every table that holds
 * the person's data (`PERSONAL_COLUMNS` in account-privacy.service) must be
 * listed here or in `EXPORT_OMITTED`; a test checks both against the schema.
 */
export const EXPORT_SECTIONS: Readonly<Record<string, string>> = {
  users: 'account',
  legal_acceptances: 'account.legalAcceptances',
  billing_accounts: 'billing.account',
  purchases: 'billing.purchases',
  packs: 'billing.packs',
  usage_balances: 'billing.usageBalances',
  usage_ledger: 'billing.usage',
  career_profiles: 'profile.preferences',
  career_facts: 'profile.facts',
  career_fact_revisions: 'profile.facts[].revisions',
  resume_imports: 'profile.imports',
  import_daily_counts: 'profile.importDays',
  resumes: 'documents.resumes',
  resume_versions: 'documents.resumes[].versions',
  writing_documents: 'documents.writing',
  career_evidence: 'documents.evidence',
  evidence_verifications: 'documents.evidence[].verifications',
  business_queue_items: 'workspace.queue (workspace scope, counts only)',
  portfolios: 'documents.portfolios',
  portfolio_evidence: 'documents.portfolios[].evidenceIds',
  portfolio_visit_days: 'documents.portfolios[].visitsByDay',
  opportunities: 'opportunities.pasted',
  opportunity_revisions: 'opportunities.pasted[].revisions',
  saved_searches: 'opportunities.savedSearches',
  saved_opportunities: 'opportunities.saved',
  career_reminders: 'opportunities.reminders',
  reminder_deliveries: 'opportunities.reminders[].deliveries',
  location_profiles: 'opportunities.locationProfiles',
  followed_companies: 'opportunities.followedCompanies',
  alert_settings: 'opportunities.alertSettings',
  alert_items: 'opportunities.alerts',
  notification_deliveries: 'opportunities.alerts[].deliveries',
  digests: 'opportunities.digests',
  match_results: 'opportunities.matches',
  opportunity_reports: 'opportunities.reports',
  applications: 'applications',
  application_reminders: 'applications[].reminders',
  interview_sessions: 'practice.interviews',
  interview_answers: 'practice.interviews[].answers',
  star_stories: 'practice.starStories',
  coaching_threads: 'practice.coaching',
  coaching_messages: 'practice.coaching[].messages',
  voice_interview_sessions: 'practice.voiceSessions',
  voice_audio_records: 'practice.voiceSessions[].recordings',
  recording_consents: 'practice.recordingConsents',
  action_packs: 'career.actionPacks',
  skill_gap_reports: 'career.skillReports',
  candidate_specialist_modes: 'career.specialistModes',
  career_scenarios: 'career.scenarios',
  career_achievements: 'career.achievements',
  career_promotion_goals: 'career.promotionGoals',
  credential_reminders: 'career.credentialReminders',
  assisted_form_sessions: 'career.assistedForms',
  map_sessions: 'career.mapSessions',
  recruiting_opt_ins: 'career.recruitingOptIn',
  business_staff: 'workspace.staffSeats',
  ai_jobs: 'processing.aiJobs',
  account_exports: 'processing.exports',
  admin_audit: 'processing.operatorActions',
  api_keys: 'workspace.apiKeys (workspace scope)',
  white_label_configs: 'workspace.whiteLabel (workspace scope)',
  business_candidates: 'workspace.invitations (workspace scope, counts only)',
};

/** Personal tables, or parts of them, that the export leaves out on purpose. */
export const EXPORT_OMITTED: Readonly<Record<string, string>> = {
  stored_object_intents: 'internal storage bookkeeping; holds private object keys only',
  shared_record_tombstones: 'ids of records already deleted, kept only to refuse late writes from the other site',
  shared_record_requests: 'retry bookkeeping for creates from the other site; the records themselves are exported',
  'opportunity_reports.reviewer_auth_user_id': 'reports this person reviewed belong to the people who filed them',
  'business_candidates.email': "invited people's addresses are their data, not the inviter's",
  'api_keys.key_hash': 'credential material',
  'portfolios.share_token': 'works like a password for a private page',
  'career_evidence.attachment_object_key': 'private storage key; files are fetched through the API instead',
  'voice_audio_records.audio_object_key': 'private storage key for a practice recording; the recording is described (length, type, size) instead',
  'usage_ledger.idempotency_key': 'request bookkeeping; may embed other request keys',
  'billing_accounts.provider_*_id': 'payment-provider identifiers; available from the provider directly',
};

export interface ExportOptions {
  scope: 'personal' | 'workspace';
  generatedAt: Date;
}

/**
 * The person's own data, as plain JSON. File contents are not inside it:
 * each stored evidence file is described (name, type, size, SHA-256) and can
 * be downloaded while signed in with `GET /api/career/v1/evidence/:id/attachment`,
 * which returns a five-minute link. No passwords exist in V2 (sign-in is
 * Firebase); no credential, storage key, signed URL, provider id, or other
 * person's data is included.
 */
export async function personalExport(db: Db, owner: Principal, options: ExportOptions): Promise<Record<string, unknown>> {
  const uid = owner.authUserId;
  const ws = owner.workspaceId;
  const rows = async (sql: string, params: unknown[] = [uid]) => (await db.query(sql, params)).rows;
  const groupBy = <T extends Record<string, unknown>>(list: T[], key: string) => {
    const map = new Map<string, T[]>();
    for (const row of list) {
      const k = String(row[key]);
      if (!map.has(k)) map.set(k, []);
      const { [key]: _drop, ...rest } = row;
      map.get(k)!.push(rest as T);
    }
    return map;
  };

  const account = (await rows(`SELECT locale, settings, created_at, updated_at FROM users WHERE auth_user_id = $1`))[0] ?? null;
  const legal = await rows(
    `SELECT terms_version, privacy_version, disclaimer_version, accepted_at FROM legal_acceptances WHERE auth_user_id = $1 ORDER BY accepted_at`,
  );
  const billing = (
    await rows(
      `SELECT plan_id, legacy_plan, catalog_version, interval, status, trial_end, has_used_trial, period_start, period_end,
              cancel_at_period_end, scheduled_plan_id, scheduled_interval, provider, origin, spending_cap_cents, auto_topup, created_at
         FROM billing_accounts WHERE id = $1`,
      [owner.billingAccountId],
    )
  )[0] ?? null;
  const purchases = await rows(
    `SELECT kind, sku, catalog_version, amount_cents, currency, purchased_at, refunded_cents, refunded_at
       FROM purchases WHERE billing_account_id = $1 ORDER BY purchased_at`,
    [owner.billingAccountId],
  );
  const packs = await rows(
    `SELECT addon_id, unit, purchased_units, remaining_units, purchased_at, expires_at, status, revoked_units, revoked_at
       FROM packs WHERE billing_account_id = $1 ORDER BY purchased_at`,
    [owner.billingAccountId],
  );
  const balances = await rows(
    `SELECT unit, included_granted, included_remaining, allowance_period_start, allowance_period_end
       FROM usage_balances WHERE billing_account_id = $1 ORDER BY allowance_period_start, unit`,
    [owner.billingAccountId],
  );
  const usage = await rows(
    `SELECT unit, quantity, state, allowance_period_start, created_at, committed_at, released_at
       FROM usage_ledger WHERE billing_account_id = $1 ORDER BY created_at`,
    [owner.billingAccountId],
  );

  const preferences = (await rows(`SELECT version, preferences, updated_at FROM career_profiles WHERE candidate_auth_user_id = $1`))[0] ?? null;
  const facts = await rows(
    `SELECT id, fact_type, value, source, confirmation, uncertain, revision, created_at, updated_at, confirmed_at
       FROM career_facts WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
  );
  const revisions = groupBy(
    await rows(
      `SELECT r.fact_id, r.revision, r.value, r.confirmation, r.change, r.changed_at
         FROM career_fact_revisions r JOIN career_facts f ON f.id = r.fact_id
        WHERE f.candidate_auth_user_id = $1 ORDER BY r.fact_id, r.revision`,
    ),
    'fact_id',
  );
  const imports = await rows(
    `SELECT file_name, format, char_count, fact_count, provider, model, created_at FROM resume_imports WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
  );
  const importDays = await rows(`SELECT usage_date, count FROM import_daily_counts WHERE auth_user_id = $1 ORDER BY usage_date`);

  const resumes = await rows(
    `SELECT id, title, language, template_id, created_at FROM resumes WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
  );
  const versions = groupBy(
    await rows(
      `SELECT v.resume_id, v.version_number, v.body, v.opportunity_revision_id, v.created_at
         FROM resume_versions v JOIN resumes r ON r.id = v.resume_id
        WHERE r.candidate_auth_user_id = $1 ORDER BY v.resume_id, v.version_number`,
    ),
    'resume_id',
  );
  const writing = await rows(
    `SELECT id, document_type, title, body, template_id, confirmation, opportunity_revision_id, linked_resume_id, created_at, updated_at
       FROM writing_documents WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
  );
  const evidence = (
    await rows(
      `SELECT id, title, description, evidence_type, ownership_statement, linked_skills, attachment_url, attachment_name,
              attachment_size_bytes, attachment_object_key IS NOT NULL AS stored, attachment_content_type, attachment_sha256,
              attachment_uploaded_at, evidence_label, verification_notes, verified_at, verifier_name, is_portfolio_shared,
              linked_fact_ids, confidential, redaction_note, redaction_confirmed_at, created_at, updated_at,
              COALESCE((SELECT json_agg(json_build_object(
                  'label', v.label, 'method', v.method, 'checkedOn', v.checked_on, 'scope', v.scope, 'issuerName', v.issuer_name,
                  'permissionEvidence', v.permission_evidence, 'expiresOn', v.expires_on, 'revokedAt', v.revoked_at,
                  'revokedReason', v.revoked_reason, 'recordedAt', v.created_at) ORDER BY v.created_at)
                FROM evidence_verifications v WHERE v.evidence_id = career_evidence.id), '[]'::json) AS verifications
         FROM career_evidence WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
    )
  ).map((row) => {
    const { stored, attachment_url, attachment_name, attachment_size_bytes, attachment_content_type, attachment_sha256, attachment_uploaded_at, ...rest } = row;
    return {
      ...rest,
      link: stored ? null : attachment_url ? { url: attachment_url, name: attachment_name } : null,
      file: stored
        ? {
            name: attachment_name,
            contentType: attachment_content_type,
            sizeBytes: Number(attachment_size_bytes),
            sha256: attachment_sha256,
            uploadedAt: attachment_uploaded_at,
            retrieve: `GET /api/career/v1/evidence/${row.id}/attachment while signed in (returns a five-minute download link)`,
          }
        : null,
    };
  });
  const portfolios = await rows(
    `SELECT id, slug, title, headline, display_name, locale, visibility, show_email, show_phone, contact_email, contact_phone, published_at, created_at, updated_at
       FROM portfolios WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
  );
  const portfolioEvidence = groupBy(
    await rows(
      `SELECT pe.portfolio_id, pe.evidence_id, pe.position FROM portfolio_evidence pe JOIN portfolios p ON p.id = pe.portfolio_id
        WHERE p.candidate_auth_user_id = $1 ORDER BY pe.portfolio_id, pe.position`,
    ),
    'portfolio_id',
  );
  const visits = groupBy(
    await rows(
      `SELECT d.portfolio_id, d.visited_on, d.views FROM portfolio_visit_days d JOIN portfolios p ON p.id = d.portfolio_id
        WHERE p.candidate_auth_user_id = $1 ORDER BY d.portfolio_id, d.visited_on`,
    ),
    'portfolio_id',
  );

  const pasted = await rows(`SELECT id, category, title, organization, status FROM opportunities WHERE candidate_auth_user_id = $1 ORDER BY id`);
  const pastedRevisions = groupBy(
    await rows(
      `SELECT r.opportunity_id, r.revision, r.title, r.organization, r.locations, r.eligibility, r.compensation, r.deadline, r.source_url, r.description, r.checked_at
         FROM opportunity_revisions r JOIN opportunities o ON o.id = r.opportunity_id
        WHERE o.candidate_auth_user_id = $1 ORDER BY r.opportunity_id, r.revision`,
    ),
    'opportunity_id',
  );
  const savedSearches = await rows(
    `SELECT filters, location_profile_id, radius_miles, schedule, paused, created_at FROM saved_searches WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
  );
  const locations = await rows(
    `SELECT id, place, radius_miles, kind, target_timeline, is_relocation, move_date, available_from, remote_region, work_authorization,
            license_transfer, commute_minutes_max, remote_flexibility, notes, created_at, updated_at
       FROM location_profiles WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
  );
  const companies = await rows(`SELECT name, source_url, aliases, roles, locations, created_at FROM followed_companies WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`);
  const savedListings = await rows(
    `SELECT s.opportunity_id, r.title, s.created_at
       FROM saved_opportunities s
       JOIN opportunities o ON o.id = s.opportunity_id
       LEFT JOIN opportunity_revisions r ON r.id = o.current_revision_id
      WHERE s.candidate_auth_user_id = $1 ORDER BY s.created_at, s.opportunity_id`,
  );
  const careerReminders = await rows(
    `SELECT id, kind, title, due_date, link, read_at, created_at FROM career_reminders WHERE candidate_auth_user_id = $1 ORDER BY due_date, id`,
  );
  const reminderDeliveries = groupBy(
    await rows(
      `SELECT d.reminder_id, d.channel, d.status, d.sent_at FROM reminder_deliveries d JOIN career_reminders c ON c.id = d.reminder_id
        WHERE c.candidate_auth_user_id = $1 ORDER BY d.reminder_id, d.channel`,
    ),
    'reminder_id',
  );
  const alertSettings = (
    await rows(
      `SELECT email, push, telegram, digest, quiet_start, quiet_end, paused, last_matched_at, last_digest_at FROM alert_settings WHERE candidate_auth_user_id = $1`,
    )
  )[0] ?? null;
  const alerts = await rows(
    `SELECT a.id, a.opportunity_id, r.title, a.reason, a.read_at, a.created_at
       FROM alert_items a LEFT JOIN opportunity_revisions r ON r.id = a.material_revision_id
      WHERE a.recipient_auth_user_id = $1 ORDER BY a.created_at`,
  );
  const deliveries = groupBy(
    await rows(
      `SELECT d.alert_item_id, d.channel, d.status, d.sent_at FROM notification_deliveries d JOIN alert_items a ON a.id = d.alert_item_id
        WHERE a.recipient_auth_user_id = $1 ORDER BY d.alert_item_id`,
    ),
    'alert_item_id',
  );
  const digests = await rows(`SELECT period_start, channel, sent_at FROM digests WHERE recipient_auth_user_id = $1 ORDER BY period_start`);
  const matches = await rows(
    `SELECT opportunity_id, opportunity_revision_id, resume_version_id, profile_version, fit, overlap, reasons, gaps, unknowns, preferences, preference_fit, created_at
       FROM match_results WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
  );
  const reports = await rows(
    `SELECT opportunity_id, reason, notes, status, created_at, reviewed_at, review_action FROM opportunity_reports WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
  );

  const applications = await rows(
    `SELECT id, opportunity_id, opportunity_revision_id, resume_version_id, letter_version_id, status, contacts, notes, dates, checklist, source_snapshot, created_at, updated_at
       FROM applications WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
  );
  const reminders = groupBy(
    await rows(
      `SELECT r.application_id, r.remind_at, r.sent_at FROM application_reminders r JOIN applications a ON a.id = r.application_id
        WHERE a.candidate_auth_user_id = $1 ORDER BY r.application_id, r.remind_at`,
    ),
    'application_id',
  );
  const interviews = await rows(
    `SELECT id, opportunity_id, stage, title, questions, summary, created_at, updated_at FROM interview_sessions WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
  );
  const answers = groupBy(
    await rows(
      `SELECT a.session_id, a.question_index, a.answer, a.feedback, a.challenge, a.created_at FROM interview_answers a
         JOIN interview_sessions s ON s.id = a.session_id WHERE s.candidate_auth_user_id = $1 ORDER BY a.session_id, a.question_index`,
    ),
    'session_id',
  );
  const stories = await rows(
    `SELECT fact_ids, situation, task, action, result, created_at FROM star_stories WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
  );
  const coachingThreads = await rows(
    `SELECT id, opportunity_id, title, created_at, updated_at FROM coaching_threads WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
  );
  const coachingMessages = groupBy(
    await rows(
      `SELECT m.thread_id, m.position, m.role, m.content, m.created_at FROM coaching_messages m
         JOIN coaching_threads t ON t.id = m.thread_id WHERE t.candidate_auth_user_id = $1 ORDER BY m.thread_id, m.position`,
    ),
    'thread_id',
  );
  const voiceSessions = await rows(
    `SELECT id, kind, opportunity_id, stage, title, prompt, fact_text, guidance, summary, created_at, updated_at
       FROM voice_interview_sessions WHERE candidate_auth_user_id = $1 ORDER BY created_at, id`,
  );
  const recordings = groupBy(
    await rows(
      `SELECT r.session_id, r.duration_seconds, r.requested_seconds, r.truncated, r.transcript, r.feedback, r.audio_deleted_at,
              r.audio_content_type, r.audio_size_bytes, r.measured_milliseconds, r.duration_source, r.transcript_source, r.created_at
         FROM voice_audio_records r JOIN voice_interview_sessions s ON s.id = r.session_id
        WHERE s.candidate_auth_user_id = $1 ORDER BY r.session_id, r.created_at`,
    ),
    'session_id',
  );
  const consents = await rows(`SELECT consent_version, consented_at FROM recording_consents WHERE candidate_auth_user_id = $1 ORDER BY consented_at`);

  const career = {
    actionPacks: await rows(
      `SELECT opportunity_id, vacancy_snapshot, profile_snapshot, fit, tailored_resume, cover_letter, checklist, next_steps, created_at, updated_at
         FROM action_packs WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
    ),
    skillReports: await rows(
      `SELECT target_role, target_industry, time_budget_hours_per_week, financial_budget_cents, skill_gaps, learning_plan, project_brief, bridge_roles, transferable_skills, progress, created_at, updated_at
         FROM skill_gap_reports WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
    ),
    specialistModes: await rows(
      `SELECT mode, modes, legacy_mode, focus_areas, custom_guidelines, updated_at FROM candidate_specialist_modes WHERE candidate_auth_user_id = $1`,
    ),
    scenarios: await rows(
      `SELECT title, options, tradeoff, location_profile_ids, skill_report_ids, created_at, updated_at
         FROM career_scenarios WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
    ),
    achievements: await rows(
      `SELECT title, details, achieved_on, fact_id, evidence_id, created_at, updated_at FROM career_achievements WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
    ),
    promotionGoals: await rows(
      `SELECT desired_title, target_date, status, confirmed_at, confirmed_fact_id, created_at, updated_at
         FROM career_promotion_goals WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
    ),
    credentialReminders: await rows(
      `SELECT name, issuer, region, expires_on, review_on, fact_id, evidence_id, created_at, updated_at
         FROM credential_reminders WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
    ),
    assistedForms: await rows(
      `SELECT site, reviewed_at, external_submitted, created_at FROM assisted_form_sessions WHERE candidate_auth_user_id = $1 ORDER BY created_at`,
    ),
    mapSessions: await rows(`SELECT minutes, created_at FROM map_sessions WHERE candidate_auth_user_id = $1 ORDER BY created_at`),
    recruitingOptIn: (await rows(`SELECT discoverable, updated_at FROM recruiting_opt_ins WHERE candidate_auth_user_id = $1`))[0] ?? null,
  };

  const staffSeats = await rows(`SELECT role, created_at FROM business_staff WHERE auth_user_id = $1 ORDER BY created_at`);
  const workspace: Record<string, unknown> = { staffSeats };
  if (options.scope === 'workspace') {
    workspace.whiteLabel = (await rows(`SELECT brand_name, attribution FROM white_label_configs WHERE workspace_id = $1`, [ws]))[0] ?? null;
    workspace.apiKeys = await rows(`SELECT key_prefix, created_at FROM api_keys WHERE workspace_id = $1 ORDER BY created_at`, [ws]);
    workspace.invitations = (
      await rows(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE consent)::int AS consented FROM business_candidates WHERE workspace_id = $1`,
        [ws],
      )
    )[0];
    // Roles and dates only: invited addresses and tokens belong to the invitees, not the owner.
    workspace.staff = await rows(
      `SELECT role, accepted_at IS NOT NULL AS accepted, created_at FROM business_staff WHERE workspace_id = $1 ORDER BY created_at`,
      [ws],
    );
    workspace.queue = (
      await rows(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE candidate_id IS NOT NULL)::int AS recommended FROM business_queue_items WHERE workspace_id = $1`,
        [ws],
      )
    )[0];
  }

  const processing = {
    aiJobs: await rows(
      `SELECT kind, unit, status, error_code, provider, prompt_template_version, created_at, finished_at FROM ai_jobs WHERE owner_auth_user_id = $1 ORDER BY created_at`,
    ),
    exports: await rows(`SELECT id, scope, status, created_at, expires_at FROM account_exports WHERE auth_user_id = $1 ORDER BY created_at`),
    operatorActions: await rows(`SELECT action, target, created_at FROM admin_audit WHERE actor_auth_user_id = $1 ORDER BY created_at`),
  };

  return {
    format: { name: 'flacroncv-personal-export', version: EXPORT_FORMAT_VERSION, scope: options.scope, generatedAt: options.generatedAt.toISOString() },
    attachments: {
      included: false,
      howToRetrieve:
        'Stored evidence files are described under documents.evidence[].file. Download each while signed in with GET /api/career/v1/evidence/:id/attachment, which returns a five-minute link. Links you supplied yourself are under documents.evidence[].link.',
    },
    notIncluded: Object.values(EXPORT_OMITTED),
    account: account ? { ...account, legalAcceptances: legal } : null,
    billing: { account: billing, purchases, packs, usageBalances: balances, usage },
    profile: {
      preferences,
      facts: facts.map((fact) => ({ ...fact, revisions: revisions.get(String(fact.id)) ?? [] })),
      imports,
      importDays,
    },
    documents: {
      resumes: resumes.map((r) => ({ ...r, versions: versions.get(String(r.id)) ?? [] })),
      writing,
      evidence,
      portfolios: portfolios.map((p) => ({
        ...p,
        evidenceIds: (portfolioEvidence.get(String(p.id)) ?? []).map((e) => e.evidence_id),
        visitsByDay: visits.get(String(p.id)) ?? [],
      })),
    },
    opportunities: {
      pasted: pasted.map((o) => ({ ...o, revisions: pastedRevisions.get(String(o.id)) ?? [] })),
      savedSearches,
      locationProfiles: locations,
      followedCompanies: companies,
      alertSettings,
      alerts: alerts.map((a) => ({ ...a, deliveries: deliveries.get(String(a.id)) ?? [] })),
      digests,
      matches,
      reports,
      saved: savedListings,
      reminders: careerReminders.map((c) => ({ ...c, deliveries: reminderDeliveries.get(String(c.id)) ?? [] })),
    },
    applications: applications.map((a) => ({ ...a, reminders: reminders.get(String(a.id)) ?? [] })),
    practice: {
      interviews: interviews.map((s) => ({ ...s, answers: answers.get(String(s.id)) ?? [] })),
      starStories: stories,
      voiceSessions: voiceSessions.map((s) => ({ ...s, recordings: recordings.get(String(s.id)) ?? [] })),
      recordingConsents: consents,
      coaching: coachingThreads.map((t) => ({ ...t, messages: coachingMessages.get(String(t.id)) ?? [] })),
    },
    career,
    workspace,
    processing,
  };
}
