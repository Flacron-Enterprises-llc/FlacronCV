import { describe, expect, it } from 'vitest';
import { fieldForServerMessage, isValidContactEmail } from './contact-validation';

describe('isValidContactEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidContactEmail('jane@example.com')).toBe(true);
    expect(isValidContactEmail('  jane.doe+cv@mail.example.co.uk ')).toBe(true);
  });

  it('requires a dot in the domain, like the API', () => {
    expect(isValidContactEmail('jane@localhost')).toBe(false);
    expect(isValidContactEmail('jane@example.')).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(isValidContactEmail('')).toBe(false);
    expect(isValidContactEmail('jane')).toBe(false);
    expect(isValidContactEmail('jane @example.com')).toBe(false);
  });
});

describe('fieldForServerMessage', () => {
  it('maps the API validation messages to their field', () => {
    expect(fieldForServerMessage('A valid email address is required.')).toBe('email');
    expect(fieldForServerMessage('Name is required.')).toBe('name');
    expect(fieldForServerMessage('Message must be at most 5000 characters.')).toBe('message');
  });

  it('returns null when the field is unknown', () => {
    expect(fieldForServerMessage('Subject is required.')).toBeNull();
    expect(fieldForServerMessage(undefined)).toBeNull();
  });
});
