import { describe, expect, it } from 'vitest';
import { passwordStrength, suggestEmail } from './auth-quality';

describe('passwordStrength', () => {
  it('scores an empty password as nothing, and short ones as at most weak', () => {
    expect(passwordStrength('').level).toBe(0);
    expect(passwordStrength('Ab1!').level).toBeLessThanOrEqual(1);
    expect(passwordStrength('Ab1!').acceptable).toBe(false);
  });

  it('blocks common and obvious passwords whatever their length', () => {
    for (const pw of ['password', 'Password123!', 'qwerty123', '12345678', 'abcdefgh', 'aaaaaaaaaa', '87654321', 'flacroncv2024', 'Welcome1']) {
      const s = passwordStrength(pw);
      expect([pw, s.common, s.level, s.acceptable]).toEqual([pw, true, 0, false]);
    }
  });

  it('blocks a password that is just the person’s name or email plus digits', () => {
    expect(passwordStrength('adalovelace1', ['Ada Lovelace', 'adalovelace']).common).toBe(true);
    expect(passwordStrength('ada.l@1990', ['ada.l']).common).toBe(true);
    // A longer passphrase that merely contains the name is fine.
    expect(passwordStrength('ada-rides-blue-bikes', ['ada']).common).toBe(false);
  });

  it('grows with length and variety', () => {
    const fair = passwordStrength('mangotree');
    const good = passwordStrength('Mangotree42');
    const strong = passwordStrength('Mango-Tree-42-River');
    expect(fair.acceptable).toBe(true);
    expect(fair.level).toBeLessThan(good.level);
    expect(good.level).toBeLessThan(strong.level + 1);
    expect(strong.level).toBe(4);
  });

  it('reports each requirement separately', () => {
    expect(passwordStrength('Mangotree42!').checks).toEqual({ length: true, mixedCase: true, number: true, symbol: true });
    expect(passwordStrength('mango').checks).toEqual({ length: false, mixedCase: false, number: false, symbol: false });
  });
});

describe('suggestEmail', () => {
  it('corrects common provider typos', () => {
    expect(suggestEmail('ada@gmial.com')).toBe('ada@gmail.com');
    expect(suggestEmail('ada@gmail.con')).toBe('ada@gmail.com');
    expect(suggestEmail('ada@hotmial.com')).toBe('ada@hotmail.com');
    expect(suggestEmail('ada@yaho.com')).toBe('ada@yahoo.com');
    expect(suggestEmail(' Ada.L@Outlok.com ')).toBe('Ada.L@outlook.com');
  });

  it('leaves correct, unknown and incomplete addresses alone', () => {
    for (const email of ['ada@gmail.com', 'ada@company.io', 'ada@acme.org', 'ada@', 'ada', '@gmail.com', 'ada@gmail', 'ada@mit.edu']) {
      expect([email, suggestEmail(email)]).toEqual([email, null]);
    }
  });
});
