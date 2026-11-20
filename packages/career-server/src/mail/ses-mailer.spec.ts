import { isAllowedSandboxRecipient, isSesMailboxSimulator, isSyntheticMailbox, RecordingMailer } from './mailer';
import { containerRoleCredentials, createMailer, SesMailer, sesRoleAvailable } from './ses-mailer';

describe('SesMailer', () => {
  it('does not send to a live mailbox in sandbox', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const mailer = new SesMailer('us-east-1', 'AKIA', 'secret', 'FlacronCV <dev@example.test>', fetchImpl);
    expect(await mailer.send({ to: 'person@company.com', subject: 'Hi', text: 'Hi' })).toEqual({ delivered: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('posts SES for a synthetic mailbox', async () => {
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const mailer = new SesMailer('us-east-1', 'AKIA', 'secret', 'FlacronCV <dev@example.test>', fetchImpl);
    expect(await mailer.send({ to: 'ada@example.test', subject: 'Inquiry', text: 'Hello' })).toEqual({ delivered: true });
    expect(fetchImpl).toHaveBeenCalled();
  });

  it('posts SES for the mailbox simulator and refuses other simulator local-parts', async () => {
    const fetchImpl = jest.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
    const mailer = new SesMailer('us-east-1', 'AKIA', 'secret', 'FlacronCV <dev@example.test>', fetchImpl);
    expect(isSesMailboxSimulator('success@simulator.amazonses.com')).toBe(true);
    expect(isAllowedSandboxRecipient('success@simulator.amazonses.com')).toBe(true);
    expect(await mailer.send({ to: 'success@simulator.amazonses.com', subject: 'Probe', text: 'Probe' })).toEqual({
      delivered: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await mailer.send({ to: 'not-a-slot@simulator.amazonses.com', subject: 'Probe', text: 'No' })).toEqual({
      delivered: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('createMailer', () => {
  it('records when delivery is unset', () => {
    expect(createMailer({})).toBeInstanceOf(RecordingMailer);
    expect(isSyntheticMailbox('ada@example.test')).toBe(true);
  });

  it('uses the ECS task role when no static keys are set, and records without a sender or role', () => {
    const role = { MAIL_DELIVERY: 'live', NODE_ENV: 'production', SES_FROM_EMAIL: 'no-reply@example.test', AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: '/v2/credentials/abc-123' };
    expect(createMailer(role)).toBeInstanceOf(SesMailer);
    expect(sesRoleAvailable(role)).toBe(true);
    expect(createMailer({ ...role, SES_FROM_EMAIL: '' })).toBeInstanceOf(RecordingMailer);
    expect(createMailer({ ...role, AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: '' })).toBeInstanceOf(RecordingMailer);
    expect(createMailer({ ...role, MAIL_DELIVERY: 'record' })).toBeInstanceOf(RecordingMailer);
    expect(sesRoleAvailable({ AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: 'http://evil.example/x' })).toBe(false);
  });
});

describe('SesMailer with role credentials', () => {
  it('fetches the role credentials once, signs the session token, and sends', async () => {
    const credentialFetch = jest.fn(async () => new Response(JSON.stringify({
      AccessKeyId: 'ASIAEXAMPLE', SecretAccessKey: 'role-secret', Token: 'session-token-123', Expiration: new Date(Date.now() + 3_600_000).toISOString(),
    }), { status: 200 })) as unknown as typeof fetch;
    const credentials = containerRoleCredentials('/v2/credentials/abc', credentialFetch);
    const sent: Array<{ url: string; headers: Record<string, string> }> = [];
    const sesFetch = jest.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, headers: init.headers as Record<string, string> });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const mailer = SesMailer.withCredentials('us-east-1', credentials, 'FlacronCV <no-reply@example.test>', sesFetch, () => true);
    expect(await mailer.send({ to: 'ada@company.example', subject: 'Alert', text: 'New role' })).toEqual({ delivered: true });
    expect(await mailer.send({ to: 'bob@company.example', subject: 'Alert', text: 'New role' })).toEqual({ delivered: true });
    expect(credentialFetch).toHaveBeenCalledTimes(1);
    expect((credentialFetch as unknown as jest.Mock).mock.calls[0][0]).toBe('http://169.254.170.2/v2/credentials/abc');
    expect(sent[0]!.url).toBe('https://email.us-east-1.amazonaws.com/v2/email/outbound-emails');
    expect(sent[0]!.headers['x-amz-security-token']).toBe('session-token-123');
    expect(sent[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=ASIAEXAMPLE\/\d{8}\/us-east-1\/ses\/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-security-token, Signature=[0-9a-f]{64}$/);
  });

  it('static keys sign without a session token', async () => {
    let headers: Record<string, string> = {};
    const fetchImpl = jest.fn(async (_url: string, init: RequestInit) => { headers = init.headers as Record<string, string>; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    await new SesMailer('us-east-1', 'AKIA', 'secret', 'FlacronCV <dev@example.test>', fetchImpl).send({ to: 'ada@example.test', subject: 'x', text: 'y' });
    expect(headers['x-amz-security-token']).toBeUndefined();
    expect(headers.authorization).toMatch(/SignedHeaders=content-type;host;x-amz-date, /);
  });

  it('refuses mail when the role credentials cannot be read', async () => {
    const bad = containerRoleCredentials('/v2/credentials/abc', (async () => new Response('', { status: 500 })) as unknown as typeof fetch);
    const mailer = SesMailer.withCredentials('us-east-1', bad, 'FlacronCV <no-reply@example.test>', jest.fn() as unknown as typeof fetch, () => true);
    await expect(mailer.send({ to: 'ada@company.example', subject: 'x', text: 'y' })).rejects.toMatchObject({ code: 'provider_unavailable' });
  });
});
