/**
 * Which outside providers this career service can actually use, for the V1
 * purchase-availability check (a pack is sold only when its provider is
 * ready). Booleans only: never a key, a bucket name or any configuration value.
 *
 * - ai: the same rule as createTextModel (AI_PROVIDER=openai + OPENAI_API_KEY).
 * - objectStorage: s3 with a bucket, or the local-disk store used in
 *   development. `memory` (tests only) and unset are not ready.
 * - speech: the same rule as createSpeechTranscriber (SPEECH_PROVIDER=openai
 *   + OPENAI_API_KEY).
 * - jobFeeds: at least one feed source configured (Greenhouse boards, Lever
 *   sites, Adzuna or USAJOBS keys; see opportunities/feed-ingest).
 * - mapTiles: no live adapter exists in this build, so it is never ready.
 */
import { speechProviderReady } from '../ai/openai-speech-transcriber';
import { feedConfigFromEnv, feedsConfigured } from '../opportunities/feed-ingest';

export interface ProviderReadiness {
  ai: boolean;
  objectStorage: boolean;
  speech: boolean;
  mapTiles: boolean;
  jobFeeds: boolean;
}

export function providerReadiness(env: NodeJS.ProcessEnv = process.env): ProviderReadiness {
  const ai = (env.AI_PROVIDER?.trim().toLowerCase() ?? '') === 'openai' && (env.OPENAI_API_KEY?.trim() ?? '').length > 0;
  const storageMode = env.OBJECT_STORAGE?.trim().toLowerCase() ?? '';
  const objectStorage = (storageMode === 's3' && (env.OBJECT_STORAGE_BUCKET?.trim() ?? '').length > 0) || storageMode === 'local';
  return { ai, objectStorage, speech: speechProviderReady(env), mapTiles: false, jobFeeds: feedsConfigured(feedConfigFromEnv(env)) };
}
