import { validateProfileLink } from '@flacroncv/shared-types';

/**
 * The profile form has three link fields side by side. Before this rule the
 * server checked only "is a string, under 500 chars", so anything at all saved:
 * a GitHub URL in the LinkedIn box, a bare word, a `javascript:` payload. The
 * values are rendered as clickable links on a CV that gets exported to PDF and
 * shared, so a wrong one is published under the wrong label and a hostile one
 * is stored XSS with a distribution channel.
 */
describe('validateProfileLink', () => {
  describe('accepts genuine profile links', () => {
    it.each([
      ['linkedin', 'https://linkedin.com/in/someone'],
      ['linkedin', 'https://www.linkedin.com/in/someone'],
      // LinkedIn issues real country-subdomain profile URLs.
      ['linkedin', 'https://pk.linkedin.com/in/someone'],
      ['github', 'https://github.com/someone'],
      ['github', 'https://www.github.com/someone/repo'],
      ['website', 'https://example.com'],
      ['website', 'http://example.com/path'],
    ] as const)('%s ← %s', (field, url) => {
      expect(validateProfileLink(field, url).error).toBeUndefined();
    });
  });

  describe('rejects a link for the wrong site — the reported bug', () => {
    it.each([
      ['linkedin', 'https://github.com/someone'],
      ['linkedin', 'https://example.com/in/someone'],
      ['github', 'https://linkedin.com/in/someone'],
      ['github', 'https://gitlab.com/someone'],
      // Suffix matching must not be fooled by a lookalike domain.
      ['github', 'https://notgithub.com/someone'],
      ['linkedin', 'https://linkedin.com.evil.test/in/someone'],
    ] as const)('%s ✗ %s', (field, url) => {
      expect(validateProfileLink(field, url).error).toBeDefined();
    });
  });

  it('rejects a site home page where a profile is expected', () => {
    // `https://github.com` identifies nobody — this is the paste-the-homepage
    // mistake, which is a valid URL on the right host and so passes every
    // check except this one.
    expect(validateProfileLink('github', 'https://github.com').error).toBeDefined();
    expect(validateProfileLink('linkedin', 'https://www.linkedin.com/').error).toBeDefined();
    // Website has no such requirement — a bare domain is the normal case.
    expect(validateProfileLink('website', 'https://example.com').error).toBeUndefined();
  });

  it('rejects non-http schemes on every field', () => {
    for (const field of ['linkedin', 'github', 'website'] as const) {
      expect(validateProfileLink(field, 'javascript:alert(1)').error).toBeDefined();
      expect(validateProfileLink(field, 'data:text/html,<script>').error).toBeDefined();
      expect(validateProfileLink(field, 'ftp://example.com/x').error).toBeDefined();
    }
  });

  it('rejects free text that is not a link at all', () => {
    expect(validateProfileLink('website', 'not a url').error).toBeDefined();
    expect(validateProfileLink('github', 'my github').error).toBeDefined();
  });

  it('accepts a scheme-less paste and normalises it', () => {
    // The scheme is the part people leave off; rejecting this reads as the
    // field being broken rather than as a correction.
    expect(validateProfileLink('github', 'github.com/someone')).toEqual({
      value: 'https://github.com/someone',
    });
    expect(validateProfileLink('linkedin', 'www.linkedin.com/in/someone').value).toBe(
      'https://www.linkedin.com/in/someone',
    );
  });

  it('treats an empty value as clearing the field', () => {
    for (const field of ['linkedin', 'github', 'website'] as const) {
      expect(validateProfileLink(field, '')).toEqual({ value: '' });
      expect(validateProfileLink(field, '   ')).toEqual({ value: '' });
    }
  });

  it('enforces the length cap', () => {
    const long = `https://github.com/${'a'.repeat(600)}`;
    expect(validateProfileLink('github', long, 500).error).toBeDefined();
  });

  it('is case-insensitive about the host', () => {
    expect(validateProfileLink('github', 'https://GitHub.COM/someone').error).toBeUndefined();
  });
});
