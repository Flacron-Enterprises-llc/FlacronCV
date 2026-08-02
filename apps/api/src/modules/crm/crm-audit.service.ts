import { Injectable } from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { AuditService } from '../audit/audit.service';
import { AuditLogEntry, AuditLogListParams } from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CRMAuditService {
  private readonly col = 'crm_audit_log';

  constructor(
    private firebase: FirebaseAdminService,
    private audit: AuditService,
  ) {}

  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<void> {
    const id = uuidv4();
    const record: AuditLogEntry = { id, ...entry, timestamp: new Date() };
    await this.firebase.firestore.collection(this.col).doc(id).set(record);

    // Mirror into the platform-wide `audit_logs` collection.
    //
    // The CRM writes here (role changes, plan changes, suspend/reactivate,
    // subscription edits, settings) are exactly the events the admin Audit Logs
    // page is expected to show — but that page reads `audit_logs`, so none of
    // them were ever visible there. Mirroring in one place covers every current
    // and future CRM call site; the CRM keeps its own richer record for its own
    // audit view. Best-effort: AuditService swallows its own write failures, so
    // a mirroring problem can never fail the CRM action itself.
    await this.audit.log({
      actorId: entry.actorId,
      actorEmail: entry.actorEmail,
      actorRole: 'admin',
      action: entry.action,
      resource: entry.targetType,
      resourceId: entry.targetId,
      metadata: { targetName: entry.targetName, ...entry.details },
    });
  }

  async list(params: AuditLogListParams): Promise<{
    items: AuditLogEntry[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 200);

    let query: FirebaseFirestore.Query = this.firebase.firestore
      .collection(this.col)
      .orderBy('timestamp', 'desc');

    if (params.action) query = query.where('action', '==', params.action);
    if (params.actorId) query = query.where('actorId', '==', params.actorId);
    if (params.targetType) query = query.where('targetType', '==', params.targetType);
    if (params.startDate) query = query.where('timestamp', '>=', new Date(params.startDate));
    if (params.endDate) query = query.where('timestamp', '<=', new Date(params.endDate));

    const snapshot = await query.limit(2000).get();
    const items = snapshot.docs.map((d: any) => d.data() as AuditLogEntry);

    const total = items.length;
    const pages = Math.ceil(total / limit);
    const paginated = items.slice((page - 1) * limit, page * limit);

    return { items: paginated, total, page, limit, pages };
  }
}
