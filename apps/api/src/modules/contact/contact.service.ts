import { BadRequestException, Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';

export interface ContactMessageInput {
  name?: string;
  email?: string;
  subject?: string;
  category?: string;
  message?: string;
}

@Injectable()
export class ContactService {
  private static readonly CATEGORIES = ['general', 'support', 'billing', 'partnership'];

  constructor(private readonly mail: MailService) {}

  async submit(data: ContactMessageInput): Promise<{ ok: true }> {
    const name = this.requireString('Name', data.name, 100);
    const email = this.requireEmail(data.email);
    const subject = this.requireString('Subject', data.subject, 200);
    const message = this.requireString('Message', data.message, 5000);
    const category = ContactService.CATEGORIES.includes(data.category ?? '')
      ? (data.category as string)
      : 'general';

    await this.mail.sendContactMessage({ name, email, subject, category, message });
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
}
