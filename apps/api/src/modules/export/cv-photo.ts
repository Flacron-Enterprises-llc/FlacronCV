/**
 * CV photo for the server-side exports (mobile app: POST /cvs/:id/export/*).
 *
 * The server fetches the photo itself and hands it to both renderers as bytes:
 * the PDF gets a `data:` URI (so Chromium's request allowlist stays `data:`
 * only — see `allowPrintSubresource`) and the DOCX gets an embedded image.
 *
 * `photoURL` is user-controlled, so fetching it is an SSRF surface. The rules:
 *  - https only, default port, no credentials in the URL;
 *  - host must be exactly one of the Google Storage download hosts below
 *    (no suffix match, no IP literals, no redirects followed);
 *  - strict timeout over the whole request including the body;
 *  - body capped at 5 MB while streaming (Content-Length is not trusted);
 *  - Content-Type must be image/jpeg, image/png or image/webp AND the bytes
 *    must carry that format's signature.
 * Any failure returns `{ ok: false }` — callers export without the photo and
 * never fail the export because of it. Never log the URL: Firebase download
 * URLs carry an access token.
 */

export const CV_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const CV_PHOTO_TIMEOUT_MS = 5000;
const CV_PHOTO_URL_MAX = 2048;

/** Where Firebase / Cloud Storage serve download URLs. Exact host match only. */
export const CV_PHOTO_HOSTS: ReadonlySet<string> = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

export type CvPhotoType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface CvPhoto {
  data: Buffer;
  contentType: CvPhotoType;
}

export type CvPhotoResult =
  | ({ ok: true } & CvPhoto)
  | { ok: false; reason: string };

/** The URL, parsed, if it may be fetched; otherwise null. */
export function allowedCvPhotoUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > CV_PHOTO_URL_MAX) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.port !== '') return null;
  if (!CV_PHOTO_HOSTS.has(url.hostname)) return null;
  return url;
}

function sniff(data: Buffer): CvPhotoType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const body = res.body;
  if (!body) return null;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export interface FetchCvPhotoOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

/** Fetch the CV photo under the rules above. Never throws. */
export async function fetchCvPhoto(raw: unknown, opts: FetchCvPhotoOptions = {}): Promise<CvPhotoResult> {
  const url = allowedCvPhotoUrl(raw);
  if (!url) return { ok: false, reason: 'url_not_allowed' };

  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? CV_PHOTO_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? CV_PHOTO_MAX_BYTES;
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const work = async (): Promise<CvPhotoResult> => {
    const res = await fetchImpl(url.toString(), {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: { Accept: 'image/jpeg, image/png, image/webp' },
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };

    const declared = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (declared !== 'image/jpeg' && declared !== 'image/png' && declared !== 'image/webp') {
      return { ok: false, reason: 'content_type' };
    }
    const length = Number(res.headers.get('content-length'));
    if (Number.isFinite(length) && length > maxBytes) return { ok: false, reason: 'too_large' };

    const data = await readCapped(res, maxBytes);
    if (!data) return { ok: false, reason: 'too_large_or_empty' };
    if (data.length === 0) return { ok: false, reason: 'empty' };
    if (sniff(data) !== declared) return { ok: false, reason: 'signature_mismatch' };
    return { ok: true, data, contentType: declared };
  };

  const timeout = new Promise<CvPhotoResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, reason: 'timeout' });
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      work().catch((): CvPhotoResult => ({ ok: false, reason: 'fetch_failed' })),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** `data:` URI for the PDF renderer. Only built from validated bytes. */
export function cvPhotoDataUri(photo: CvPhoto): string {
  return `data:${photo.contentType};base64,${photo.data.toString('base64')}`;
}

/** Pixel size from the PNG header / JPEG SOF marker; null if unreadable. */
export function cvPhotoDimensions(photo: CvPhoto): { width: number; height: number } | null {
  const d = photo.data;
  if (photo.contentType === 'image/png') {
    if (d.length < 24) return null;
    const width = d.readUInt32BE(16);
    const height = d.readUInt32BE(20);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (photo.contentType === 'image/jpeg') {
    let i = 2;
    while (i + 9 < d.length) {
      if (d[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = d[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        i += 2;
        continue;
      }
      const segLen = d.readUInt16BE(i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = d.readUInt16BE(i + 5);
        const width = d.readUInt16BE(i + 7);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      if (segLen < 2) return null;
      i += 2 + segLen;
    }
  }
  return null;
}
