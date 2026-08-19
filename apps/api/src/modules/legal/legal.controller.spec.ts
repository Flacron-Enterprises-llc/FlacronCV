import { LegalController } from './legal.controller';
import { RecordLegalAcceptanceDto } from './dto/record-legal-acceptance.dto';

describe('LegalController', () => {
  const dto: RecordLegalAcceptanceDto = {
    termsAccepted: true,
    privacyAccepted: true,
    disclaimerAccepted: true,
    termsVersion: '2026-08-16',
    privacyVersion: '2026-08-16',
    disclaimerVersion: '2026-08-16',
  };

  it('writes the token uid and token email, never a body uid', async () => {
    const record = jest.fn().mockResolvedValue({ userId: 'token-uid' });
    const controller = new LegalController({ record, findByUid: jest.fn() } as any);
    await controller.record({ uid: 'token-uid', email: 'a@b.com', role: 'user' }, dto);
    expect(record).toHaveBeenCalledWith('token-uid', 'a@b.com', dto);
  });

  it('GET mine is scoped to the token uid', async () => {
    const findByUid = jest.fn().mockResolvedValue(null);
    const controller = new LegalController({ record: jest.fn(), findByUid } as any);
    const result = await controller.mine({ uid: 'token-uid', email: 'a@b.com', role: 'user' });
    expect(findByUid).toHaveBeenCalledWith('token-uid');
    expect(result).toEqual({ acceptance: null });
  });
});
