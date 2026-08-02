import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { LeadStatus } from '@flacroncv/shared-types';

function makeService() {
  const firestore = new InMemoryFirestore();
  const mail = { sendLeadConfirmation: jest.fn() };
  const config = { get: () => 'http://localhost:3000' };
  const service = new LeadsService({ firestore } as any, mail as any, config as any);
  return { service, firestore, mail };
}

const base = {
  email: 'a@b.com',
  source: 'homepage',
  consent: true,
  consentText: 'I agree to receive emails.',
  consentVersion: 'v1',
};

describe('LeadsService', () => {
  it('rejects capture without consent (never pre-selected)', async () => {
    const { service } = makeService();
    await expect(service.capture({ ...base, consent: false }, {})).rejects.toThrow(BadRequestException);
  });

  it('captures a new lead as PENDING with a consent record + tokens', async () => {
    const { service } = makeService();
    const res = await service.capture({ ...base }, { ip: '1.2.3.4' });
    expect(res.status).toBe(LeadStatus.PENDING);

    const lead = await service.findByEmail('A@B.com'); // case-insensitive dedupe key
    expect(lead).not.toBeNull();
    expect(lead!.email).toBe('a@b.com');
    expect(lead!.status).toBe(LeadStatus.PENDING);
    expect(lead!.consent.granted).toBe(true);
    expect(lead!.consent.text).toBe(base.consentText);
    expect(lead!.consent.version).toBe('v1');
    expect(lead!.consent.ip).toBe('1.2.3.4');
    expect(typeof lead!.confirmationToken).toBe('string');
    expect(typeof lead!.unsubscribeToken).toBe('string');
  });

  it('sends a double-opt-in confirmation email (with a tokened link) on capture', async () => {
    const { service, mail } = makeService();
    await service.capture({ ...base }, {});
    expect(mail.sendLeadConfirmation).toHaveBeenCalledTimes(1);
    const [toEmail, url] = mail.sendLeadConfirmation.mock.calls[0];
    expect(toEmail).toBe('a@b.com');
    expect(url).toContain('/confirm?token=');
  });

  it('dedupes by email — a re-capture refreshes rather than duplicating', async () => {
    const { service } = makeService();
    await service.capture({ ...base }, {});
    await service.capture({ ...base, source: 'exit-intent' }, {});
    const lead = await service.findByEmail('a@b.com');
    expect(lead!.source).toBe('exit-intent');
    expect(lead!.status).toBe(LeadStatus.PENDING);
  });

  it('confirm activates the lead (SUBSCRIBED) and clears the token', async () => {
    const { service } = makeService();
    await service.capture({ ...base }, {});
    const lead = await service.findByEmail('a@b.com');
    const res = await service.confirm(lead!.confirmationToken!);
    expect(res.confirmed).toBe(true);

    const after = await service.findByEmail('a@b.com');
    expect(after!.status).toBe(LeadStatus.SUBSCRIBED);
    expect(after!.confirmationToken).toBeNull();
    expect(after!.confirmedAt).not.toBeNull();
  });

  it('confirm with an unknown token is an idempotent no-op', async () => {
    const { service } = makeService();
    expect(await service.confirm('nope')).toEqual({ confirmed: false });
  });

  it('does NOT resurrect an unsubscribed lead via a (now-invalidated) confirmation token', async () => {
    const { service } = makeService();
    await service.capture({ ...base }, {});
    const lead = await service.findByEmail('a@b.com');
    await service.unsubscribe(lead!.unsubscribeToken); // also nulls the confirmationToken
    const res = await service.confirm(lead!.confirmationToken!);
    expect(res.confirmed).toBe(false);
    expect((await service.findByEmail('a@b.com'))!.status).toBe(LeadStatus.UNSUBSCRIBED);
  });

  it('unsubscribe sets UNSUBSCRIBED; re-capture restarts double-opt-in', async () => {
    const { service } = makeService();
    await service.capture({ ...base }, {});
    const lead = await service.findByEmail('a@b.com');
    await service.unsubscribe(lead!.unsubscribeToken);

    const off = await service.findByEmail('a@b.com');
    expect(off!.status).toBe(LeadStatus.UNSUBSCRIBED);
    expect(off!.unsubscribedAt).not.toBeNull();

    const res = await service.capture({ ...base }, {});
    expect(res.status).toBe(LeadStatus.PENDING);
    const back = await service.findByEmail('a@b.com');
    expect(back!.status).toBe(LeadStatus.PENDING);
    expect(back!.unsubscribedAt).toBeNull();
  });
});
