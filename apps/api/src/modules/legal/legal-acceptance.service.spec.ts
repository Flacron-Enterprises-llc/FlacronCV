import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, Logger } from '@nestjs/common';
import { LegalAcceptanceService } from './legal-acceptance.service';
import { InMemoryFirestore } from '../firebase/in-memory-firestore';
import { LEGAL_ACCEPTANCES_COLLECTION } from '@flacroncv/shared-types';

function makeService() {
  const firestore = new InMemoryFirestore();
  const service = new LegalAcceptanceService({ firestore } as any);
  return { service, firestore };
}

const dto = {
  termsAccepted: true,
  privacyAccepted: true,
  disclaimerAccepted: true,
  termsVersion: '2026-08-16',
  privacyVersion: '2026-08-16',
  disclaimerVersion: '2026-08-16',
};

describe('LegalAcceptanceService', () => {
  const EMAIL = 'owner@example.com';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes legalAcceptances/{uid} by document id, not a query', async () => {
    const { service, firestore } = makeService();
    await service.record('uid-1', EMAIL, dto);

    const snap = await firestore.collection(LEGAL_ACCEPTANCES_COLLECTION).doc('uid-1').get();
    expect(snap.exists).toBe(true);
    expect(snap.data()).toEqual(
      expect.objectContaining({
        userId: 'uid-1',
        email: EMAIL,
        termsAccepted: true,
        privacyAccepted: true,
        disclaimerAccepted: true,
        termsVersion: '2026-08-16',
        privacyVersion: '2026-08-16',
        disclaimerVersion: '2026-08-16',
      }),
    );
  });

  it('does not query the collection (no composite index)', () => {
    const src = readFileSync(join(__dirname, 'legal-acceptance.service.ts'), 'utf8');
    expect(src).not.toMatch(/\.where\s*\(/);
  });

  it('cannot write another uid — the stored userId is the argument, not a body field', async () => {
    const { service, firestore } = makeService();
    await service.record('token-uid', EMAIL, dto);

    const own = await firestore.collection(LEGAL_ACCEPTANCES_COLLECTION).doc('token-uid').get();
    const other = await firestore.collection(LEGAL_ACCEPTANCES_COLLECTION).doc('other-uid').get();
    expect(own.exists).toBe(true);
    expect(own.data()?.userId).toBe('token-uid');
    expect(other.exists).toBe(false);
  });

  it('rejects when any of the three acceptances is not true', async () => {
    const { service } = makeService();
    await expect(service.record('uid-1', EMAIL, { ...dto, termsAccepted: false })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.record('uid-1', EMAIL, { ...dto, privacyAccepted: false })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.record('uid-1', EMAIL, { ...dto, disclaimerAccepted: false })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('GET missing returns null — not a lockout', async () => {
    const { service } = makeService();
    await expect(service.findByUid('nobody')).resolves.toBeNull();
  });

  it('overwrites the snapshot on re-consent', async () => {
    const { service } = makeService();
    await service.record('uid-1', EMAIL, dto);
    const second = await service.record('uid-1', EMAIL, { ...dto, termsVersion: '2026-09-01' });
    expect(second.termsVersion).toBe('2026-09-01');
    const stored = await service.findByUid('uid-1');
    expect(stored?.termsVersion).toBe('2026-09-01');
  });

  it('never logs the stored email', async () => {
    const { service } = makeService();
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    await service.record('uid-1', EMAIL, dto);
    const joined = spy.mock.calls.map((c) => c.map(String).join(' ')).join('\n');
    expect(joined).toContain('uid=uid-1');
    expect(joined).not.toContain(EMAIL);
  });

  it('does not gate existing documents — CV and cover-letter services never import legal acceptance', () => {
    const cv = readFileSync(join(__dirname, '../cv/cv.service.ts'), 'utf8');
    const letters = readFileSync(join(__dirname, '../cover-letter/cover-letter.service.ts'), 'utf8');
    expect(cv).not.toMatch(/legalAcceptance|LEGAL_ACCEPTANCES/);
    expect(letters).not.toMatch(/legalAcceptance|LEGAL_ACCEPTANCES/);
  });
});
