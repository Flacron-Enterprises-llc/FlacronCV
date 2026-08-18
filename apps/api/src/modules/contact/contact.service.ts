import { BadRequestException, Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';

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

  constructor(private readonly mail: MailService) {}

  async submit(data: ContactMessageInput): Promise<{ ok: true }> {
    const name = this.requireString('Name', data.name, 100);
    const email = this.requireEmail(data.email);
    const subject = this.requireString('Subject', data.subject, 200);
    const message = this.requireString('Message', data.message, 5000);
    const category = ContactService.CATEGORIES.includes(data.category ?? '')
      ? (data.category as string)
      : 'general';

    await this.mail.sendContactMessage({
      name,
      email,
      subject,
      category,
      message,
      accountEmail: this.optionalEmail(data.accountEmail),
      plan: this.optionalString(data.plan, 40),
      userId: this.optionalString(data.userId, 128),
      timestamp: this.optionalString(data.timestamp, 40) ?? new Date().toISOString(),
    });
    return { ok: true };
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
