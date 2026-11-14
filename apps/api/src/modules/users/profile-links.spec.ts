import {
  checkProfileLink,
  parseProfileLinkErrorCode,
  profileLinkErrorCode,
  validateProfileLink,
} from '@flacroncv/shared-types';

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
  // Chrome normalises "not a url" to https://not%20a%20url/ while Node's URL
  // rejects it, so the form accepted what the API refused. These inputs must be
  // rejected by the shared rule itself, whichever runtime parses them.
  describe('rejects typos that a forgiving URL parser would accept', () => {
    it.each([
      ['website', 'not a url'],
      ['website', 'my site.com'],
      ['website', 'https://example.com/a b'],
      ['website', 'example.com	/a'],
      ['github', 'https://github.com/jane doe'],
      ['website', 'jane'],
      ['website', 'https://localhost/x'],
      ['website', 'https://[::1]/x'],
    ] as const)('%s ✗ %j', (field, input) => {
      expect(checkProfileLink(field, input).issue).toEqual({ code: 'invalid' });
    });

    it('still accepts an IPv4 address and a trailing-dot domain', () => {
      expect(checkProfileLink('website', 'https://127.0.0.1/x').issue).toBeUndefined();
      expect(checkProfileLink('website', 'https://example.com./').issue).toBeUndefined();
    });
  });

  describe('reports the reason as a code so clients can translate it', () => {
    it.each([
      ['github', 'x'.repeat(30), { code: 'too_long', max: 20 }, 20],
      ['website', 'ftp://example.com/x', { code: 'scheme' }, 500],
      ['linkedin', 'https://github.com/jane', { code: 'host', host: 'linkedin.com' }, 500],
      ['github', 'https://github.com', { code: 'profile_path', host: 'github.com' }, 500],
    ] as const)('%s %j', (field, input, issue, max) => {
      expect(checkProfileLink(field, input, max).issue).toEqual(issue);
    });

    it('keeps an English sentence for the API message', () => {
      expect(validateProfileLink('linkedin', 'https://github.com/jane').error).toBe(
        'LinkedIn link must be on linkedin.com.',
      );
    });

    it('round-trips the 400 error code', () => {
      const code = profileLinkErrorCode('website', { code: 'invalid' });
      expect(code).toBe('PROFILE_LINK_WEBSITE_INVALID');
      expect(parseProfileLinkErrorCode(code)).toEqual({ field: 'website', issue: 'invalid' });
      expect(parseProfileLinkErrorCode('NO_SUBSCRIPTION')).toBeUndefined();
      expect(parseProfileLinkErrorCode(undefined)).toBeUndefined();
    });
  });
});

