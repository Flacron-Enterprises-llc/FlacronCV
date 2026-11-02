import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createObjectStorage, LocalDiskObjectStorage } from './local-disk-storage';
import { MemoryObjectStorage, UnconfiguredObjectStorage, assertObjectKey, attachmentDisposition } from './object-storage';
import { S3ObjectStorage } from './s3-object-storage';

describe('LocalDiskObjectStorage', () => {
  it('writes a file and signs a local URL that carries its name and type', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'flacroncv-export-'));
    try {
      const storage = new LocalDiskObjectStorage(directory, 'secret');
      await storage.put('a/b.json', Buffer.from('{"ok":true}'));
      const url = await storage.signedUrl('a/b.json', new Date(Date.now() + 60_000), { fileName: 'Données.json', contentType: 'application/json' });
      expect(url).toContain('local-exports');
      expect(url).toContain('sig=');
      const q = new URL(url).searchParams;
      const opened = await storage.openSigned(q.get('key') ?? '', Number(q.get('exp')), q.get('sig') ?? '', q.get('name') ?? '', q.get('type') ?? '');
      expect(opened.body.toString()).toBe('{"ok":true}');
      expect(opened.fileName).toBe('Données.json');
      expect(opened.contentType).toBe('application/json');
      // The name and type are signed: changing either breaks the link.
      await expect(storage.openSigned(q.get('key') ?? '', Number(q.get('exp')), q.get('sig') ?? '', 'other.json', q.get('type') ?? '')).rejects.toMatchObject({ code: 'not_found' });
      await expect(storage.openSigned('a/b.json', Date.now() - 1, 'deadbeef')).rejects.toMatchObject({ code: 'not_found' });
      await expect(storage.openSigned('../b.json', Date.now() + 60_000, 'deadbeef')).rejects.toMatchObject({ code: 'not_found' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('chooses the store from OBJECT_STORAGE and stays unconfigured otherwise', () => {
    expect(createObjectStorage({})).toBeInstanceOf(UnconfiguredObjectStorage);
    expect(createObjectStorage({ OBJECT_STORAGE: 'memory' })).toBeInstanceOf(MemoryObjectStorage);
    expect(createObjectStorage({ OBJECT_STORAGE: 'local', OBJECT_STORAGE_DIR: '/tmp/x' })).toBeInstanceOf(LocalDiskObjectStorage);
    expect(createObjectStorage({ OBJECT_STORAGE: 's3', OBJECT_STORAGE_BUCKET: 'b', AWS_REGION: 'us-east-1' })).toBeInstanceOf(S3ObjectStorage);
  });
});

describe('object keys and download names', () => {
  it('accepts server-built keys and refuses traversal, absolute, and odd keys', () => {
    expect(() => assertObjectKey('evidence/ws/abc/item/0f6e')).not.toThrow();
    for (const key of ['', '/abs', 'a/../b', '..', 'a//b', 'a/b/', 'a b', 'a/é', 'x'.repeat(513)]) {
      expect(() => assertObjectKey(key)).toThrow();
    }
  });

  it('writes an ASCII fallback and a UTF-8 name for Content-Disposition', () => {
    expect(attachmentDisposition('Résumé "final".pdf')).toBe(
      `attachment; filename="R_sum_ _final_.pdf"; filename*=UTF-8''R%C3%A9sum%C3%A9%20%22final%22.pdf`,
    );
    expect(attachmentDisposition(undefined)).toBe(`attachment; filename="download"; filename*=UTF-8''download`);
  });
});
