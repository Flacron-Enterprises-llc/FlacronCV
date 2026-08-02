import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { MailService } from '../mail/mail.service';
import { Lead, LeadStatus, ConsentRecord, CreateLeadData } from '@flacroncv/shared-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Marketing lead capture with GDPR consent + double-opt-in.
 *
 * The doc id IS the normalized email, so a concurrent double-submit upserts the
 * same document instead of creating duplicate leads. On new/re-opt-in capture a
 * confirmation email is sent (best-effort) and the lead stays PENDING until
 * {@link confirm} is called with that email's token.
 */
@Injectable()
export class LeadsService {
  private readonly collection = 'leads';

  constructor(
    private firebaseAdmin: FirebaseAdminService,
    private mail: MailService,
    private config: ConfigService,
  ) {}

  private get col() {
    return this.firebaseAdmin.firestore.collection(this.collection);
  }

  /** The email doubles as the document id → naturally dedupes on capture. */
  private static docId(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Fire-and-forget double-opt-in email (MailService swallows its own errors). */
  private sendConfirmation(email: string, token: string): void {
    const base = (this.config.get<string>('frontendUrl') || '').replace(/\/+$/, '');
    void this.mail.sendLeadConfirmation(email, `${base}/en/confirm?token=${token}`);
  }

  /** Capture (or refresh) a lead. Consent is mandatory. */
  async capture(data: CreateLeadData, meta: { ip?: string | null }): Promise<{ status: LeadStatus }> {
    if (data.consent !== true) {
      throw new BadRequestException('Consent is required to subscribe.');
    }
    const email = LeadsService.docId(data.email);
    const now = new Date();
    const consent: ConsentRecord = {
      granted: true,
      text: data.consentText,
      version: data.consentVersion,
      date: now.toISOString(),
      source: data.source,
      ip: meta.ip ?? null,
    };

    const ref = this.col.doc(email);
    const existing = await ref.get();
    if (existing.exists) {
      const lead = existing.data() as Lead;
      const patch: Record<string, unknown> = {
        consent,
        source: data.source,
        name: data.name?.trim() || lead.name || null,
        updatedAt: now,
      };
      // Re-opting-in after an unsubscribe restarts the double-opt-in flow.
      if (lead.status === LeadStatus.UNSUBSCRIBED) {
        patch.status = LeadStatus.PENDING;
        patch.confirmationToken = uuidv4();
        patch.unsubscribedAt = null;
      }
      await ref.update(patch);
      if (patch.status === LeadStatus.PENDING) {
        this.sendConfirmation(email, patch.confirmationToken as string);
      }
      return { status: (patch.status as LeadStatus) ?? lead.status };
    }

    const lead: Lead = {
      id: email,
      email,
      name: data.name?.trim() || null,
      source: data.source,
      status: LeadStatus.PENDING,
      consent,
      confirmationToken: uuidv4(),
      unsubscribeToken: uuidv4(),
      createdAt: now,
      updatedAt: now,
      confirmedAt: null,
      unsubscribedAt: null,
    };
    await ref.set(lead);
    this.sendConfirmation(email, lead.confirmationToken as string);
    return { status: LeadStatus.PENDING };
  }

  /** Complete double-opt-in. Idempotent: unknown/spent tokens are a no-op. */
  async confirm(token: string): Promise<{ confirmed: boolean }> {
    if (!token) throw new BadRequestException('Missing confirmation token.');
    const snap = await this.col.where('confirmationToken', '==', token).get();
    if (snap.docs.length === 0) return { confirmed: false };
    const lead = snap.docs[0].data() as Lead;
    const now = new Date();
    // Never resurrect an explicit opt-out via a stale confirmation link — just
    // invalidate the token and report failure.
    if (lead.status === LeadStatus.UNSUBSCRIBED) {
      await this.col.doc(lead.id).update({ confirmationToken: null, updatedAt: now });
      return { confirmed: false };
    }
    await this.col.doc(lead.id).update({
      status: LeadStatus.SUBSCRIBED,
      confirmedAt: now,
      confirmationToken: null,
      updatedAt: now,
    });
    return { confirmed: true };
  }

  /** One-click unsubscribe via the tokened link. Idempotent. */
  async unsubscribe(token: string): Promise<{ unsubscribed: boolean }> {
    if (!token) throw new BadRequestException('Missing unsubscribe token.');
    const snap = await this.col.where('unsubscribeToken', '==', token).get();
    if (snap.docs.length === 0) return { unsubscribed: false };
    const lead = snap.docs[0].data() as Lead;
    const now = new Date();
    await this.col.doc(lead.id).update({
      status: LeadStatus.UNSUBSCRIBED,
      unsubscribedAt: now,
      // Kill any live double-opt-in link so it can't re-subscribe an opt-out.
      confirmationToken: null,
      updatedAt: now,
    });
    return { unsubscribed: true };
  }

  async findByEmail(email: string): Promise<Lead | null> {
    const doc = await this.col.doc(LeadsService.docId(email)).get();
    return doc.exists ? (doc.data() as Lead) : null;
  }
}
