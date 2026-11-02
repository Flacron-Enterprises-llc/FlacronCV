import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

describe('unpacked extension', () => {
  it('limits host permissions to example-jobs.test and never auto-submits', () => {
    const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
    assert.equal(manifest.manifest_version, 3);
    assert.deepEqual(manifest.permissions, ['activeTab']);
    assert.ok(manifest.host_permissions.length > 0);
    assert.ok(
      manifest.host_permissions.every(
        (pattern) => /example-jobs\.test/.test(pattern) || /^https?:\/\/(127\.0\.0\.1|localhost):4101\//.test(pattern),
      ),
    );
    assert.ok(manifest.host_permissions.some((pattern) => /example-jobs\.test/.test(pattern)));
    assert.ok(manifest.host_permissions.some((pattern) => /127\.0\.0\.1:4101/.test(pattern)));
    assert.ok(
      !manifest.host_permissions.some((pattern) => pattern === '<all_urls>' || pattern === '*://*/*' || pattern === '*://*'),
    );
    const content = readFileSync(join(root, 'content.js'), 'utf8');
    assert.match(content, /submit !== false/);
    assert.doesNotMatch(content, /type="submit"\)\.click|form\.submit/);
    const background = readFileSync(join(root, 'background.js'), 'utf8');
    assert.match(background, /submit !== false/);
    assert.match(background, /example-jobs\.test/);
    const fixture = readFileSync(join(root, 'fixtures/example-jobs.html'), 'utf8');
    assert.match(fixture, /name="full_name"/);
    assert.match(fixture, /name="email"/);
    assert.match(fixture, /type="submit"/);
    assert.match(fixture, /example-jobs\.test/);
  });
});
