import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RecordLegalAcceptanceDto } from './record-legal-acceptance.dto';

function dto(overrides: Record<string, unknown> = {}) {
  return plainToInstance(RecordLegalAcceptanceDto, {
    termsAccepted: true,
    privacyAccepted: true,
    disclaimerAccepted: true,
    termsVersion: '2026-08-16',
    privacyVersion: '2026-08-16',
    disclaimerVersion: '2026-08-16',
    ...overrides,
  });
}

describe('RecordLegalAcceptanceDto', () => {
  it('accepts all three true with non-empty versions', async () => {
    expect(await validate(dto())).toHaveLength(0);
  });

  it('rejects a false acceptance boolean', async () => {
    expect((await validate(dto({ termsAccepted: false }))).length).toBeGreaterThan(0);
    expect((await validate(dto({ privacyAccepted: false }))).length).toBeGreaterThan(0);
    expect((await validate(dto({ disclaimerAccepted: false }))).length).toBeGreaterThan(0);
  });

  it('rejects empty version strings', async () => {
    expect((await validate(dto({ termsVersion: '' }))).length).toBeGreaterThan(0);
  });
});
