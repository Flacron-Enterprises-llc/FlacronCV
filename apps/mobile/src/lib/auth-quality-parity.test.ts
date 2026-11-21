import { describe, expect, it } from 'vitest';
import * as mobile from './auth-quality';
import * as web from '../../../web/src/lib/auth-quality';

// The app and the website must judge passwords and email typos the same way.
const PASSWORDS = ['', 'abc', 'password', 'Password123!', 'qwerty123', '12345678', 'mangotree', 'Mangotree42', 'Mango-Tree-42-River', 'Welcome1', 'aaaaaaaaaa', 'Zz9!zz9!zz9!', 'adalovelace1'];
const EMAILS = ['ada@gmial.com', 'ada@gmail.com', 'ada@gmail.con', 'ada@company.io', 'ada@', 'ada@hotmial.com', ' Ada.L@Outlok.com ', 'ada@mit.edu'];

describe('auth-quality parity with the website', () => {
  it('scores passwords identically', () => {
    for (const pw of PASSWORDS) expect([pw, mobile.passwordStrength(pw, ['Ada Lovelace', 'adalovelace'])]).toEqual([pw, web.passwordStrength(pw, ['Ada Lovelace', 'adalovelace'])]);
  });
  it('suggests the same email fixes', () => {
    for (const email of EMAILS) expect([email, mobile.suggestEmail(email)]).toEqual([email, web.suggestEmail(email)]);
  });
});
