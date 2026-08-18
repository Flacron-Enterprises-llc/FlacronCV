import { isDisposableEmail } from './disposable-email';

describe('isDisposableEmail', () => {
  it('flags known disposable domains, case-insensitive', () => {
    expect(isDisposableEmail('user@mailinator.com')).toBe(true);
    expect(isDisposableEmail('User@YopMail.COM')).toBe(true);
  });

  it('does not flag ordinary providers or plus-addressing on them', () => {
    expect(isDisposableEmail('ada@gmail.com')).toBe(false);
    expect(isDisposableEmail('ada+tag@gmail.com')).toBe(false);
    expect(isDisposableEmail('person@university.edu')).toBe(false);
  });

  it('returns false for missing or malformed input', () => {
    expect(isDisposableEmail(undefined)).toBe(false);
    expect(isDisposableEmail('')).toBe(false);
    expect(isDisposableEmail('no-at-sign')).toBe(false);
  });
});
