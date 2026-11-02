import { fingerprintRequest } from './fingerprint';

describe('fingerprintRequest', () => {
  it('ignores key order', () => {
    expect(fingerprintRequest({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(
      fingerprintRequest({ b: { d: [1, 2], c: 2 }, a: 1 }),
    );
  });

  it('changes when a value changes', () => {
    expect(fingerprintRequest({ instructions: 'short' })).not.toBe(fingerprintRequest({ instructions: 'long' }));
  });

  it('keeps array order significant', () => {
    expect(fingerprintRequest([1, 2])).not.toBe(fingerprintRequest([2, 1]));
  });
});
