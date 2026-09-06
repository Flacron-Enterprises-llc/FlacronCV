import { decodeJwsPayload, coerceStoreDate, InvalidStoreReceiptError } from './store-receipt-verifier';

describe('decodeJwsPayload', () => {
  it('reads a JSON payload from a three-part JWS', () => {
    const payload = Buffer.from(JSON.stringify({ transactionId: 'tx-9', productId: 'pro_monthly' })).toString(
      'base64url',
    );
    expect(decodeJwsPayload(`hdr.${payload}.sig`)).toEqual({
      transactionId: 'tx-9',
      productId: 'pro_monthly',
    });
  });

  it('rejects a malformed JWS', () => {
    expect(() => decodeJwsPayload('not-a-jws')).toThrow(InvalidStoreReceiptError);
    expect(() => decodeJwsPayload('hdr.not-json.sig')).toThrow(InvalidStoreReceiptError);
  });
});

describe('coerceStoreDate', () => {
  it('accepts epoch millis, seconds, ISO strings, and Date', () => {
    const iso = '2026-10-15T00:00:00.000Z';
    expect(coerceStoreDate(iso)?.toISOString()).toBe(iso);
    expect(coerceStoreDate(new Date(iso))?.toISOString()).toBe(iso);
    expect(coerceStoreDate(Date.parse(iso))?.toISOString()).toBe(iso);
    expect(coerceStoreDate(String(Date.parse(iso)))?.toISOString()).toBe(iso);
  });

  it('returns null for empty or unparseable values', () => {
    expect(coerceStoreDate(null)).toBeNull();
    expect(coerceStoreDate('')).toBeNull();
    expect(coerceStoreDate('nope')).toBeNull();
  });
});
