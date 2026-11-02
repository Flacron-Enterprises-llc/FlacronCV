import { isAllowedSandboxRecipient, isSesMailboxSimulator, isSyntheticMailbox, RecordingMailer } from './mailer';
import { createMailer, SesMailer } from './ses-mailer';

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
});
