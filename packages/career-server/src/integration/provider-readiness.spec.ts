import { providerReadiness } from './provider-readiness';

describe('providerReadiness', () => {
  it('is all false on an empty environment', () => {
    expect(providerReadiness({})).toEqual({ ai: false, objectStorage: false, speech: false, mapTiles: false, jobFeeds: false });
  });

  it('needs both AI_PROVIDER=openai and a key for ai', () => {
    expect(providerReadiness({ OPENAI_API_KEY: 'sk-x' }).ai).toBe(false);
    expect(providerReadiness({ AI_PROVIDER: 'openai' }).ai).toBe(false);
    expect(providerReadiness({ AI_PROVIDER: 'OpenAI', OPENAI_API_KEY: 'sk-x' }).ai).toBe(true);
  });

  it('counts s3 with a bucket and local disk as storage, not memory or s3 without a bucket', () => {
    expect(providerReadiness({ OBJECT_STORAGE: 's3' }).objectStorage).toBe(false);
    expect(providerReadiness({ OBJECT_STORAGE: 's3', OBJECT_STORAGE_BUCKET: 'b' }).objectStorage).toBe(true);
    expect(providerReadiness({ OBJECT_STORAGE: 'local' }).objectStorage).toBe(true);
    expect(providerReadiness({ OBJECT_STORAGE: 'memory' }).objectStorage).toBe(false);
  });

  it('never reports speech, map tiles or job feeds ready: no live adapter exists', () => {
    const env = { SPEECH_PROVIDER: 'x', MAP_TILES_KEY: 'x', ADZUNA_APP_ID: 'x' } as NodeJS.ProcessEnv;
    expect(providerReadiness(env)).toMatchObject({ speech: false, mapTiles: false, jobFeeds: false });
  });

  it('never exposes a configuration value', () => {
    const out = providerReadiness({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-secret', OBJECT_STORAGE: 's3', OBJECT_STORAGE_BUCKET: 'bucket-name' });
    expect(JSON.stringify(out)).not.toMatch(/sk-secret|bucket-name/);
  });
});
