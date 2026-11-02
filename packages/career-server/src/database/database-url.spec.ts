import { isLocalDatabaseUrl, redactDatabaseUrl } from './database-url';

describe('isLocalDatabaseUrl', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('treats %s as local', (host) => {
    expect(isLocalDatabaseUrl(`postgresql://u:p@${host}:5432/db`)).toBe(true);
  });

  it('treats another host as remote', () => {
    expect(isLocalDatabaseUrl('postgresql://u:p@10.0.0.5:5432/db')).toBe(false);
  });
});

describe('redactDatabaseUrl', () => {
  const url = 'postgresql://user:p%40ss@127.0.0.1:5432/db';

  it('removes the url, the encoded password, and the decoded password', () => {
    const text = `failed ${url} with p%40ss and p@ss`;
    const out = redactDatabaseUrl(text, url);
    expect(out).not.toContain('p%40ss');
    expect(out).not.toContain('p@ss');
    expect(out).not.toContain(url);
  });

  it('returns the text when no url is set', () => {
    expect(redactDatabaseUrl('message', undefined)).toBe('message');
  });
});
