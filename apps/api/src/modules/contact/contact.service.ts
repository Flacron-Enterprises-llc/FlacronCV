import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseAdminService } from '../firebase/firebase-admin.service';
import { MailService } from '../mail/mail.service';

/** Server-only collection; firestore.rules' default deny keeps clients out. */
export const CONTACT_MESSAGES_COLLECTION = 'contact_messages';

/**
 * received        — stored, notification not attempted yet
 * notified        — stored and the support inbox was emailed
 * notify_failed   — stored, but the email failed; staff must pick it up from
 *                   the collection (the visitor was told it was received)
 */
export type ContactMessageStatus = 'received' | 'notified' | 'notify_failed';

export interface ContactMessageInput {
  name?: string;
  email?: string;
  subject?: string;
  category?: string;
  message?: string;
  accountEmail?: string;
  plan?: string;
  userId?: string;
  timestamp?: string;
}

@Injectable()
export class ContactService {
  // Current public form + the four legacy values so an old client is not
  // coerced to "general" until caches turn over.
  private static readonly CATEGORIES = [
    'general_question',
    'account_support',
    'login_password',
    'technical_support',
    'free_plan',
    'pro_plan',
    'enterprise_plan',
    'billing_subscription',
    'trial',
    'cancellation',
    'refund_request',
    'cv_builder',
    'cover_letter_builder',
    'ats_optimization',
    'ats_score',
    'ai_writing_assistant',
    'templates',
    'export_problem',
    'job_tracker',
    'feature_request',
    'partnership',
    'business_enterprise',
    'media_inquiry',
    'privacy_request',
    'legal_inquiry',
    'security_concern',
    'other',
    'general',
    'support',
    'billing',
  ];

  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly mail: MailService,
    private readonly firebaseAdmin: FirebaseAdminService,
  ) {}

  /**
   * Store the message, then notify the support inbox.
   *
   * The message is persisted FIRST so an email outage cannot lose it: the
   * visitor used to get a 500 and the message was gone whenever SES failed.
   * Now a failed notification is logged and recorded on the document, and the
   * visitor still gets success. Only when the message could be neither stored
   * nor emailed does the request fail (503), because then nothing kept it.
   */
  async submit(data: ContactMessageInput): Promise<{ ok: true }> {
    const name = this.requireString('Name', data.name, 100);
    const email = this.requireEmail(data.email);
    const subject = this.requireString('Subject', data.subject, 200);
    const message = this.requireString('Message', data.message, 5000);
    const category = ContactService.CATEGORIES.includes(data.category ?? '')
      ? (data.category as string)
      : 'general';

    const fields = {
      name,
      email,
      subject,
      category,
      message,
      // Supplied by the (unauthenticated) client: informational, not verified.
      accountEmail: this.optionalEmail(data.accountEmail),
      plan: this.optionalString(data.plan, 40),
      userId: this.optionalString(data.userId, 128),
      timestamp: this.optionalString(data.timestamp, 40) ?? new Date().toISOString(),
    };

    const id = uuidv4();
    const stored = await this.store(id, fields);

    try {
      await this.mail.sendContactMessage(fields);
    } catch (error) {
      this.logger.error(
        `Contact message ${id} notification email failed${stored ? ' (message is stored)' : ''}: ${(error as Error)?.message ?? error}`,
      );
      if (!stored) {
        throw new ServiceUnavailableException('We could not receive your message. Please try again shortly.');
      }
      await this.markStatus(id, 'notify_failed');
      return { ok: true };
    }

    if (stored) await this.markStatus(id, 'notified');
    return { ok: true };
  }

  /** Returns whether the message was stored. Never throws. */
  private async store(id: string, fields: Record<string, string | undefined>): Promise<boolean> {
    try {
      // Firestore rejects `undefined` values; omit absent optional fields.
      const doc: Record<string, unknown> = { id, status: 'received' satisfies ContactMessageStatus };
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) doc[key] = value;
      }
      const now = new Date();
      doc.createdAt = now;
      doc.updatedAt = now;
      await this.firebaseAdmin.firestore.collection(CONTACT_MESSAGES_COLLECTION).doc(id).set(doc);
      return true;
    } catch (error) {
      this.logger.error(`Contact message ${id} could not be stored: ${(error as Error)?.message ?? error}`);
      return false;
    }
  }

  private async markStatus(id: string, status: ContactMessageStatus): Promise<void> {
    try {
      await this.firebaseAdmin.firestore
        .collection(CONTACT_MESSAGES_COLLECTION)
        .doc(id)
        .update({ status, updatedAt: new Date() });
    } catch (error) {
      // The message itself is safe; only its bookkeeping is stale.
      this.logger.warn(`Contact message ${id} status not updated to ${status}: ${(error as Error)?.message ?? error}`);
    }
  }

  private requireString(field: string, value: unknown, max: number): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > max) {
      throw new BadRequestException(`${field} must be at most ${max} characters.`);
    }
    return trimmed;
  }

  private requireEmail(value: unknown): string {
    if (typeof value !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      throw new BadRequestException('A valid email address is required.');
    }
    return value.trim();
  }

  private optionalString(value: unknown, max: number): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, max);
  }

  private optionalEmail(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return undefined;
    return trimmed.slice(0, 254);
  }
}
