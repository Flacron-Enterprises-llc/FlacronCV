import { createHash, createHmac } from 'crypto';
import { BillingError } from '../billing/errors';
import { isStagingDeploy, stagingMailRecipients } from '../env/deploy-env';
import { isAllowedSandboxRecipient, RecordingMailer, type MailMessage, type Mailer } from './mailer';

export class SesMailer implements Mailer {
  constructor(
    private readonly region: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly allow: (to: string) => boolean = isAllowedSandboxRecipient,
  ) {}

  async send(message: MailMessage): Promise<{ delivered: boolean }> {
    if (!this.allow(message.to)) return { delivered: false };
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const dateStamp = amzDate.slice(0, 8);
    const payload = JSON.stringify({
      FromEmailAddress: this.from,
      Destination: { ToAddresses: [message.to] },
      Content: {
        Simple: {
          Subject: { Data: message.subject },
          Body: {
            Text: { Data: message.text },
            ...(message.html ? { Html: { Data: message.html } } : {}),
          },
        },
      },
    });
    const host = `email.${this.region}.amazonaws.com`;
    const path = '/v2/email/outbound-emails';
    const headers = signedHeaders({
      method: 'POST',
      host,
      path,
      region: this.region,
      service: 'ses',
      payload,
      amzDate,
      dateStamp,
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
    });
    const response = await this.fetchImpl(`https://${host}${path}`, { method: 'POST', headers, body: payload });
    if (!response.ok) throw new BillingError('provider_unavailable', { reason: 'mail_error' });
    return { delivered: true };
  }
}

/**
 * SES keys. `SES_*` names come first so a hosted task can keep mail keys apart
 * from `AWS_*`, which the AWS SDK would otherwise pick up for S3 ahead of the
 * task role. `AWS_*` still works for existing local setups.
 */
export function sesSettings(env: NodeJS.ProcessEnv = process.env): { accessKeyId: string; secretAccessKey: string; region: string; fromEmail: string } {
  return {
    accessKeyId: env.SES_ACCESS_KEY_ID?.trim() || env.AWS_ACCESS_KEY_ID?.trim() || '',
    secretAccessKey: env.SES_SECRET_ACCESS_KEY?.trim() || env.AWS_SECRET_ACCESS_KEY?.trim() || '',
    region: env.SES_REGION?.trim() || env.AWS_REGION?.trim() || 'us-east-1',
    fromEmail: env.SES_FROM_EMAIL?.trim() ?? '',
  };
}

export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const delivery = env.MAIL_DELIVERY?.trim().toLowerCase() ?? '';
  const { accessKeyId: key, secretAccessKey: secret, region } = sesSettings(env);
  const from = formatFrom(env.SES_FROM_NAME?.trim() || 'FlacronCV', env.SES_FROM_EMAIL?.trim() ?? '');
  if (delivery === 'record' || !key || !secret || !env.SES_FROM_EMAIL?.trim()) return new RecordingMailer();
  const approved = stagingMailRecipients(env);
  const allow = isStagingDeploy(env)
    ? (to: string) => isAllowedSandboxRecipient(to) || approved.includes(to.trim().toLowerCase())
    : delivery === 'live' && env.NODE_ENV === 'production'
      ? () => true
      : isAllowedSandboxRecipient;
  return new SesMailer(region, key, secret, from, fetch, allow);
}

function formatFrom(name: string, email: string): string {
  return email ? `${name} <${email}>` : name;
}

function signedHeaders(input: {
  method: string;
  host: string;
  path: string;
  region: string;
  service: string;
  payload: string;
  amzDate: string;
  dateStamp: string;
  accessKeyId: string;
  secretAccessKey: string;
}): Record<string, string> {
  const payloadHash = createHash('sha256').update(input.payload).digest('hex');
  const canonical = [
    input.method,
    input.path,
    '',
    `content-type:application/json`,
    `host:${input.host}`,
    `x-amz-date:${input.amzDate}`,
    '',
    'content-type;host;x-amz-date',
    payloadHash,
  ].join('\n');
  const credentialScope = `${input.dateStamp}/${input.region}/${input.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', input.amzDate, credentialScope, createHash('sha256').update(canonical).digest('hex')].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, input.dateStamp), input.region), input.service),
    'aws4_request',
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return {
    'content-type': 'application/json',
    host: input.host,
    'x-amz-date': input.amzDate,
    authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}, SignedHeaders=content-type;host;x-amz-date, Signature=${signature}`,
  };
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}
