import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Mask an address before it reaches the log platform (PII). */
function maskEmail(email: string): string {
  return email.replace(/^(.).*(@.*)$/, '$1***$2');
}

const BRAND = '#ea580c';

/**
 * Shared branded shell so every transactional email looks consistent. Uses
 * table-free inline styles — the safest subset across mail clients.
 */
function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px">
    <div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:12px;padding:32px">
      <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#1c1917">${escapeHtml(heading)}</h1>
      ${bodyHtml}
    </div>
    <p style="margin:20px 0 0;text-align:center;color:#a8a29e;font-size:12px">
      &copy; ${new Date().getFullYear()} FlacronCV. All rights reserved.
    </p>
    <!-- Brand name only, and English only. These templates are not localised —
         the API has no next-intl — so no translatable prose is added here. A
         brand needs no translation; a sentence would. -->
    <p style="margin:6px 0 0;text-align:center;color:#c4c0bd;font-size:11px">
      Powered by <a href="https://flacronenterprises.com/" style="color:#a8a29e;text-decoration:none">Flacron Engine</a>
    </p>
  </div>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;background:${BRAND};color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(label)}</a></p>
<p style="margin:0;color:#78716c;font-size:12px;word-break:break-all">Or paste this link into your browser:<br/>${escapeHtml(url)}</p>`;
}

/** Crude HTML→text fallback; improves deliverability and spam scoring. */
function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly client: SESv2Client;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly replyTo: string;
  private readonly contactTo: string;

  constructor(private config: ConfigService) {
    this.fromEmail = this.config.get<string>('ses.fromEmail') || 'no-reply@flacronenterprises.com';
    this.fromName = this.config.get<string>('ses.fromName') || 'FlacronAI';
    this.replyTo = this.config.get<string>('ses.replyTo') || this.fromEmail;
    this.contactTo = this.config.get<string>('ses.contactTo') || this.replyTo;

    const accessKeyId = this.config.get<string>('ses.accessKeyId');
    const secretAccessKey = this.config.get<string>('ses.secretAccessKey');

    this.client = new SESv2Client({
      region: this.config.get<string>('ses.region') || 'us-east-1',
      // Explicit keys when provided; otherwise fall back to the default AWS
      // credential chain (instance role / task role) so production doesn't need
      // long-lived keys baked into env.
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  /** Quotes in the display name would break the From header. */
  private get fromHeader(): string {
    return `"${this.fromName.replace(/"/g, '')}" <${this.fromEmail}>`;
  }

  private async send(opts: {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
  }): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.fromHeader,
        Destination: { ToAddresses: [opts.to] },
        ReplyToAddresses: [opts.replyTo || this.replyTo],
        Content: {
          Simple: {
            Subject: { Data: opts.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: opts.html, Charset: 'UTF-8' },
              Text: { Data: toPlainText(opts.html), Charset: 'UTF-8' },
            },
          },
        },
      }),
    );
  }

  /**
   * Deliver a public contact-form submission to the support inbox. Sent from the
   * verified sender address (SES will only send as a verified identity), with
   * replyTo set to the visitor so support can reply directly. All user-supplied
   * fields are HTML-escaped before templating.
   */
  async sendContactMessage(msg: {
    name: string;
    email: string;
    subject: string;
    category: string;
    message: string;
    accountEmail?: string;
    plan?: string;
    userId?: string;
    timestamp?: string;
  }): Promise<void> {
    const accountBits = [
      msg.accountEmail
        ? `<p style="margin:0 0 8px"><strong>Account email:</strong> ${escapeHtml(msg.accountEmail)}</p>`
        : '',
      msg.plan ? `<p style="margin:0 0 8px"><strong>Plan:</strong> ${escapeHtml(msg.plan)}</p>` : '',
      msg.userId ? `<p style="margin:0 0 8px"><strong>User ID:</strong> ${escapeHtml(msg.userId)}</p>` : '',
      msg.timestamp
        ? `<p style="margin:0 0 8px"><strong>Submitted at:</strong> ${escapeHtml(msg.timestamp)}</p>`
        : '',
    ].filter(Boolean);

    const html = layout(
      `New contact message · ${msg.category}`,
      [
        `<p style="margin:0 0 8px"><strong>From:</strong> ${escapeHtml(msg.name)} &lt;${escapeHtml(msg.email)}&gt;</p>`,
        `<p style="margin:0 0 8px"><strong>Category:</strong> ${escapeHtml(msg.category)}</p>`,
        `<p style="margin:0 0 16px"><strong>Subject:</strong> ${escapeHtml(msg.subject)}</p>`,
        ...accountBits,
        '<hr style="border:none;border-top:1px solid #e7e5e4;margin:16px 0" />',
        `<p style="margin:0;color:#44403c">${escapeHtml(msg.message).replace(/\n/g, '<br />')}</p>`,
      ].join('\n'),
    );

    await this.send({
      to: this.contactTo,
      subject: `[Contact · ${msg.category}] ${msg.subject}`,
      html,
      replyTo: msg.email,
    });
    this.logger.log(`Contact message from ${maskEmail(msg.email)} delivered to ${this.contactTo}`);
  }

  /** Best-effort: a welcome-mail failure must never break signup. */
  async sendWelcomeEmail(email: string, displayName: string): Promise<void> {
    try {
      const firstName = displayName?.split(' ')[0] || 'there';
      const dashboardUrl = `${this.config.get<string>('frontendUrl') || ''}/dashboard`;
      const html = layout(
        `Welcome to FlacronCV, ${firstName}!`,
        [
          `<p style="margin:0 0 8px;color:#44403c">Your account is ready. Pick a template, let AI draft your summary and experience, and export to PDF or Word when it reads the way you want.</p>`,
          button(dashboardUrl, 'Go to your dashboard'),
        ].join('\n'),
      );
      await this.send({ to: email, subject: 'Welcome to FlacronCV', html });
      this.logger.log(`Welcome email sent to ${maskEmail(email)}`);
    } catch (err) {
      this.logger.error(`Failed to send welcome email to ${maskEmail(email)}`, err);
    }
  }

  /** Throws — the caller surfaces the failure to the user. */
  async sendPasswordResetEmail(email: string, displayName: string, resetUrl: string): Promise<void> {
    try {
      const firstName = displayName?.split(' ')[0] || 'there';
      const html = layout(
        'Reset your password',
        [
          `<p style="margin:0 0 8px;color:#44403c">Hi ${escapeHtml(firstName)}, we received a request to reset your FlacronCV password.</p>`,
          button(resetUrl, 'Reset password'),
          `<p style="margin:16px 0 0;color:#78716c;font-size:12px">If you didn't request this, you can safely ignore this email — your password will not change.</p>`,
        ].join('\n'),
      );
      await this.send({ to: email, subject: 'Reset your FlacronCV password', html });
      this.logger.log(`Password reset email sent to ${maskEmail(email)}`);
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${maskEmail(email)}`, err);
      throw err;
    }
  }

  /**
   * Double-opt-in confirmation for a marketing lead (Epic C4). **Best-effort** —
   * a send failure must never fail the signup request, so this swallows errors.
   */
  async sendLeadConfirmation(email: string, confirmUrl: string): Promise<void> {
    try {
      const html = layout(
        'Confirm your subscription',
        [
          `<p style="margin:0 0 8px;color:#44403c">Thanks for subscribing to FlacronCV. Please confirm so we know it's really you:</p>`,
          button(confirmUrl, 'Confirm my subscription'),
          `<p style="margin:16px 0 0;color:#78716c;font-size:12px">If you didn't request this, you can safely ignore this email — you won't be subscribed.</p>`,
        ].join('\n'),
      );
      await this.send({ to: email, subject: 'Confirm your FlacronCV subscription', html });
      this.logger.log(`Lead confirmation email sent to ${maskEmail(email)}`);
    } catch (err) {
      this.logger.error(`Failed to send lead confirmation email to ${maskEmail(email)}`, err);
    }
  }

  /** Throws — registration logs it, and the user can hit "Resend". */
  async sendEmailVerificationEmail(
    email: string,
    displayName: string,
    verificationUrl: string,
  ): Promise<void> {
    try {
      const firstName = displayName?.split(' ')[0] || 'there';
      const html = layout(
        'Verify your email address',
        [
          `<p style="margin:0 0 8px;color:#44403c">Hi ${escapeHtml(firstName)}, please confirm your email address to activate your FlacronCV account.</p>`,
          button(verificationUrl, 'Verify my email'),
          `<p style="margin:16px 0 0;color:#78716c;font-size:12px">If you didn't create this account, you can safely ignore this email.</p>`,
        ].join('\n'),
      );
      await this.send({ to: email, subject: 'Verify your FlacronCV email address', html });
      this.logger.log(`Verification email sent to ${maskEmail(email)}`);
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${maskEmail(email)}`, err);
      throw err;
    }
  }
}
