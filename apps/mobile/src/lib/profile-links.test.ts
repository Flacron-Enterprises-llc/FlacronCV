import { describe, expect, it } from 'vitest';
import { validateProfileLink as sharedValidate } from '../../../../packages/shared-types/src/profile-links';
import { validateProfileLink, type ProfileLinkField } from './profile-links';

const FIELDS: ProfileLinkField[] = ['linkedin', 'github', 'website'];

/** Inputs whose result must match the shared (WHATWG `URL`) implementation exactly. */
const SAME_AS_WEBSITE = [
  '',
  '   ',
  'github.com/jane',
  '  github.com/jane  ',
  'https://github.com/jane',
  'http://github.com/jane',
  'HTTPS://GitHub.com/Jane',
  'https://www.github.com/jane/',
  'https://github.com',
  'https://github.com/',
  'github.com',
  'www.linkedin.com/in/jane-doe',
  'https://pk.linkedin.com/in/jane',
  'https://linkedin.com/in/jane?trk=public#about',
  'https://linkedin.com/in/jane?',
  'https://evil-linkedin.com/in/jane',
  'https://linkedin.com.evil.com/in/jane',
  'https://github.com.:443/jane',
  'https://github.com:8443/jane',
  'https://github.com:99999/jane',
  'https://github.com:abc/jane',
  'https://user:pass@github.com/jane',
  'https://@github.com/jane',
  'https:github.com/jane',
  'https:\\\\github.com\\jane',
  'https://github.com/a/./b/../jane',
  'https://github.com/jane doe',
  'https://github.com/jane"<x>`{}',
  "https://example.com/?q=a b'c\"",
  'https://example.com/#frag ment',
  'https://example.com/café',
  'javascript:alert(1)',
  'JavaScript:alert(document.cookie)',
  'data:text/html,<script>alert(1)</script>',
  'mailto:jane@example.com',
  'https://',
  'https:///',
  'https://exa mple.com',
  'https://exa<mple.com',
  'https://[::1]/x',
  'https://127.0.0.1/x',
  'https://2130706433/',
  'https://0x7f.1/',
  'https://1.2.3.4.5/',
  'https://256.1.1.1/',
  'jane',
  'my site.com',
  'example.com',
  'Example.COM/Path?Q=1',
  'https://example.com:80/x',
  'http://example.com:80/x',
  'https://example.com:0443/x',
  'example.com\t/a\nb',
];

describe('validateProfileLink (mobile copy) matches the website/API rule', () => {
  for (const field of FIELDS) {
    for (const input of SAME_AS_WEBSITE) {
      it(`${field}: ${JSON.stringify(input)}`, () => {
        expect(validateProfileLink(field, input)).toEqual(sharedValidate(field, input));
      });
    }
  }

  it('rejects over-long values with the same message', () => {
    const long = `https://example.com/${'a'.repeat(600)}`;
    expect(validateProfileLink('website', long)).toEqual(sharedValidate('website', long));
    expect(validateProfileLink('website', long).error).toBe('Website link must be at most 500 characters.');
  });
});

describe('validateProfileLink behaviour', () => {
  it('adds https:// and keeps no trailing slash (RN URL shim would add one)', () => {
    expect(validateProfileLink('github', 'github.com/jane')).toEqual({ value: 'https://github.com/jane' });
  });

  it('empty clears the field', () => {
    expect(validateProfileLink('linkedin', '  ')).toEqual({ value: '' });
  });

  it('explains a link on the wrong site', () => {
    expect(validateProfileLink('linkedin', 'https://github.com/jane').error).toBe(
      'LinkedIn link must be on linkedin.com.',
    );
  });

  it('needs a profile path on host-restricted fields', () => {
    expect(validateProfileLink('github', 'https://github.com').error).toBe(
      'GitHub link must point at a profile, e.g. https://github.com/username.',
    );
    expect(validateProfileLink('website', 'https://example.com').value).toBe('https://example.com/');
  });

  it('refuses script URLs', () => {
    expect(validateProfileLink('website', 'javascript:alert(1)').error).toBe(
      'Website must be an http or https link.',
    );
  });
});
