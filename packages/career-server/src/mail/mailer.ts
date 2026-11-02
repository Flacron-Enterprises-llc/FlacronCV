export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<{ delivered: boolean }>;
}

/** Stores the attempt. Nothing leaves the process. */
export class RecordingMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<{ delivered: boolean }> {
    this.sent.push(message);
    return { delivered: false };
  }
}

export function isSyntheticMailbox(address: string): boolean {
  return /@(example\.test|localhost)$/i.test(address.trim());
}

const SES_SIMULATOR_HOST = 'simulator.amazonses.com';
const SES_SIMULATOR_LOCAL = /^(success|bounce|ooto|complaint|suppressionlist|blackhole)$/i;

/** AWS SES mailbox simulator. Sandbox may send these; they are not customer mailboxes. */
export function isSesMailboxSimulator(address: string): boolean {
  const trimmed = address.trim();
  const at = trimmed.lastIndexOf('@');
  if (at < 1) return false;
  return trimmed.slice(at + 1).toLowerCase() === SES_SIMULATOR_HOST && SES_SIMULATOR_LOCAL.test(trimmed.slice(0, at));
}

export function isAllowedSandboxRecipient(address: string): boolean {
  return isSyntheticMailbox(address) || isSesMailboxSimulator(address);
}
