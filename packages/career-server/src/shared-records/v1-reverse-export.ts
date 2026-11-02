import type { Pool } from 'pg';
import type { SharedCvDocument } from '@flacroncv/career-shared';
import type { ProfileOwner } from '../profile/career-profile.service';
import { SharedRecordsService } from './shared-records.service';
import type { SharedLetter } from './shared-records.service';

/**
 * Rollback support (docs/SHARED_RECORDS.md "Rollback"). Rebuilds the
 * shared records in V1's Firestore shapes from Postgres, so switching V1
 * back to its own store does not lose edits made after the switch.
 *
 * Ids: a record copied from V1 gets its original Firestore id back (from
 * `migration_keys`); a record created after the switch keeps its V2 uuid,
 * which Firestore accepts as a document id. Writing the result into
 * Firestore is V1's job and needs approval; this only reads Postgres.
 */

export interface V1CvExport extends Omit<SharedCvDocument, 'sections'> {
  id: string;
  userId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
}

export interface V1SectionExport {
  id: string;
  cvId: string;
  userId: string;
  type: string;
  title: string;
  isVisible: boolean;
  order: number;
  items: unknown[];
}

export interface V1LetterExport extends SharedLetter {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: null;
}

export interface V1ReverseSnapshot {
  cvs: V1CvExport[];
  sections: V1SectionExport[];
  coverLetters: V1LetterExport[];
  /** Tombstoned ids: V1 must soft-delete these if its own copy still has them. */
  deleted: Array<{ kind: string; id: string; userId: string }>;
}

export async function exportV1Snapshot(pool: Pool, authUserIds?: readonly string[]): Promise<V1ReverseSnapshot> {
  const shared = new SharedRecordsService(pool);
  const owners = await pool.query<{ auth_user_id: string; workspace_id: string; billing_account_id: string }>(
    `SELECT u.auth_user_id, w.id AS workspace_id, b.id AS billing_account_id
       FROM users u
       JOIN workspaces w ON w.owner_user_id = u.id AND w.kind = 'individual'
       JOIN billing_accounts b ON b.workspace_id = w.id
      WHERE $1::text[] IS NULL OR u.auth_user_id = ANY($1::text[])
      ORDER BY u.auth_user_id`,
    [authUserIds ?? null],
  );
  const origin = await pool.query<{ origin_collection: string; origin_id: string; destination_id: string }>(
    `SELECT origin_collection, origin_id, destination_id FROM migration_keys WHERE origin_collection IN ('cvs', 'cover_letters')`,
  );
  const originOf = new Map(origin.rows.map((row) => [`${row.origin_collection}:${row.destination_id}`, row.origin_id]));
  const out: V1ReverseSnapshot = { cvs: [], sections: [], coverLetters: [], deleted: [] };
  for (const row of owners.rows) {
    const owner: ProfileOwner = { authUserId: row.auth_user_id, workspaceId: row.workspace_id, billingAccountId: row.billing_account_id };
    for (const cv of (await shared.listCvs(owner)).items) {
      const id = originOf.get(`cvs:${cv.id}`) ?? cv.id;
      const { sections, ...rest } = cv.document;
      out.cvs.push({ ...rest, id, userId: owner.authUserId, version: cv.revision, createdAt: cv.createdAt, updatedAt: cv.updatedAt, deletedAt: null });
      for (const section of sections) out.sections.push({ ...section, cvId: id, userId: owner.authUserId });
    }
    for (const letter of (await shared.listLetters(owner)).items) {
      const linked = letter.letter.linkedCVId;
      out.coverLetters.push({
        ...letter.letter,
        linkedCVId: linked ? originOf.get(`cvs:${linked}`) ?? linked : null,
        id: originOf.get(`cover_letters:${letter.id}`) ?? letter.id,
        userId: owner.authUserId,
        createdAt: letter.createdAt,
        updatedAt: letter.updatedAt,
        deletedAt: null,
      });
    }
  }
  const tombs = await pool.query<{ kind: string; record_id: string; candidate_auth_user_id: string }>(
    `SELECT kind, record_id, candidate_auth_user_id FROM shared_record_tombstones
      WHERE $1::text[] IS NULL OR candidate_auth_user_id = ANY($1::text[]) ORDER BY deleted_at`,
    [authUserIds ?? null],
  );
  for (const tomb of tombs.rows) {
    const collection = tomb.kind === 'cv' ? 'cvs' : 'cover_letters';
    out.deleted.push({ kind: tomb.kind, id: originOf.get(`${collection}:${tomb.record_id}`) ?? tomb.record_id, userId: tomb.candidate_auth_user_id });
  }
  return out;
}
