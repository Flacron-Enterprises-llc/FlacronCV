import {
  CV_PHOTO_MAX_BYTES,
  allowedCvPhotoUrl,
  cvPhotoDataUri,
  cvPhotoDimensions,
  fetchCvPhoto,
} from './cv-photo';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** SOI, an APP0 segment, then SOF0 declaring 300 (h) x 200 (w). */
const JPEG_200X300 = Buffer.from([
  0xff, 0xd8,
  0xff, 0xe0, 0x00, 0x06, 0x4a, 0x46, 0x49, 0x46,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x00, 0xc8, 0x03, 0x01, 0x22, 0x00,
  0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
  0xff, 0xd9,
]);

const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);

const STORAGE_URL = 'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/avatars%2Fu%2Fcv.png?alt=media&token=t';

function imageResponse(body: Buffer, type: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': type }, ...init });
}

describe('allowedCvPhotoUrl (SSRF allow-list)', () => {
  it('accepts Firebase / Cloud Storage https download URLs', () => {
    expect(allowedCvPhotoUrl(STORAGE_URL)).not.toBeNull();
    expect(allowedCvPhotoUrl('https://storage.googleapis.com/bucket/avatars/a.jpg')).not.toBeNull();
  });

  it.each([
    ['http (not https)', 'http://firebasestorage.googleapis.com/v0/b/x/o/a.png'],
    ['metadata IP', 'https://169.254.169.254/latest/meta-data/'],
    ['localhost', 'https://localhost/a.png'],
    ['private IP', 'https://10.0.0.1/a.png'],
    ['other host', 'https://evil.example.com/a.png'],
    ['look-alike suffix', 'https://firebasestorage.googleapis.com.evil.example/a.png'],
    ['look-alike prefix', 'https://evil-firebasestorage.googleapis.com/a.png'],
    ['subdomain of allowed host', 'https://x.firebasestorage.googleapis.com/a.png'],
    ['trailing-dot host', 'https://firebasestorage.googleapis.com./v0/b/x/o/a.png'],
    ['credentials', 'https://user:pass@firebasestorage.googleapis.com/v0/b/x/o/a.png'],
    ['non-default port', 'https://firebasestorage.googleapis.com:8443/v0/b/x/o/a.png'],
    ['file scheme', 'file:///etc/passwd'],
    ['data URI', 'data:image/png;base64,AAAA'],
    ['javascript', 'javascript:alert(1)'],
    ['google avatar host (not Storage)', 'https://lh3.googleusercontent.com/a/photo'],
    ['not a URL', 'not a url'],
    ['too long', `https://firebasestorage.googleapis.com/${'a'.repeat(2100)}`],
  ])('refuses %s', (_label, url) => {
    expect(allowedCvPhotoUrl(url)).toBeNull();
  });

  it('refuses non-strings', () => {
    expect(allowedCvPhotoUrl(null)).toBeNull();
    expect(allowedCvPhotoUrl(undefined)).toBeNull();
    expect(allowedCvPhotoUrl({ toString: () => STORAGE_URL })).toBeNull();
  });
});

describe('fetchCvPhoto', () => {
  it('never calls fetch for a refused URL', async () => {
    const fetchImpl = jest.fn();
    const result = await fetchCvPhoto('https://169.254.169.254/latest/', { fetchImpl: fetchImpl as any });
    expect(result).toEqual({ ok: false, reason: 'url_not_allowed' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns the bytes of a valid PNG and does not follow redirects', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(imageResponse(PNG_1X1, 'image/png'));
    const result = await fetchCvPhoto(STORAGE_URL, { fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe('image/png');
      expect(result.data.equals(PNG_1X1)).toBe(true);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'error', method: 'GET' });
    expect(fetchImpl.mock.calls[0][1].signal).toBeDefined();
  });

  it('accepts JPEG and WebP with a matching signature', async () => {
    const jpeg = await fetchCvPhoto(STORAGE_URL, {
      fetchImpl: jest.fn().mockResolvedValue(imageResponse(JPEG_200X300, 'image/jpeg; charset=binary')),
    });
    expect(jpeg.ok && jpeg.contentType).toBe('image/jpeg');
    const webp = await fetchCvPhoto(STORAGE_URL, {
      fetchImpl: jest.fn().mockResolvedValue(imageResponse(WEBP, 'image/webp')),
    });
    expect(webp.ok && webp.contentType).toBe('image/webp');
  });

  it.each([
    ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['text/html', '<html></html>'],
    ['image/gif', 'GIF89a'],
    ['', 'x'],
  ])('refuses content-type %p', async (type, body) => {
    const result = await fetchCvPhoto(STORAGE_URL, {
      fetchImpl: jest.fn().mockResolvedValue(imageResponse(Buffer.from(body), type)),
    });
    expect(result).toEqual({ ok: false, reason: 'content_type' });
  });

  it('refuses bytes that do not match the declared type', async () => {
    const result = await fetchCvPhoto(STORAGE_URL, {
      fetchImpl: jest.fn().mockResolvedValue(imageResponse(Buffer.from('<svg/>'), 'image/png')),
    });
    expect(result).toEqual({ ok: false, reason: 'signature_mismatch' });
  });

  it('refuses a non-2xx response', async () => {
    const result = await fetchCvPhoto(STORAGE_URL, {
      fetchImpl: jest.fn().mockResolvedValue(new Response('nope', { status: 403 })),
    });
    expect(result).toEqual({ ok: false, reason: 'http_403' });
  });

  it('refuses a declared Content-Length over 5 MB without reading the body', async () => {
    const res = imageResponse(PNG_1X1, 'image/png', {
      headers: { 'content-type': 'image/png', 'content-length': String(CV_PHOTO_MAX_BYTES + 1) },
    });
    const result = await fetchCvPhoto(STORAGE_URL, { fetchImpl: jest.fn().mockResolvedValue(res) });
    expect(result).toEqual({ ok: false, reason: 'too_large' });
  });

  it('stops reading a body that grows past the cap (no/false Content-Length)', async () => {
    const big = Buffer.concat([PNG_1X1, Buffer.alloc(64)]);
    const result = await fetchCvPhoto(STORAGE_URL, {
      fetchImpl: jest.fn().mockResolvedValue(imageResponse(big, 'image/png')),
      maxBytes: 32,
    });
    expect(result).toEqual({ ok: false, reason: 'too_large_or_empty' });
  });

  it('times out and aborts a hanging request', async () => {
    let signal: AbortSignal | undefined;
    const fetchImpl = jest.fn((_url: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise<Response>(() => undefined);
    });
    const result = await fetchCvPhoto(STORAGE_URL, { fetchImpl: fetchImpl as any, timeoutMs: 20 });
    expect(result).toEqual({ ok: false, reason: 'timeout' });
    expect(signal?.aborted).toBe(true);
  });

  it('turns a network error (incl. a refused redirect) into a soft failure', async () => {
    const result = await fetchCvPhoto(STORAGE_URL, {
      fetchImpl: jest.fn().mockRejectedValue(new TypeError('fetch failed: redirect mode is set to error')),
    });
    expect(result).toEqual({ ok: false, reason: 'fetch_failed' });
  });
});

describe('cv photo helpers', () => {
  it('builds a data URI from validated bytes', () => {
    expect(cvPhotoDataUri({ data: PNG_1X1, contentType: 'image/png' })).toBe(
      `data:image/png;base64,${PNG_1X1.toString('base64')}`,
    );
  });

  it('reads PNG and JPEG pixel sizes', () => {
    expect(cvPhotoDimensions({ data: PNG_1X1, contentType: 'image/png' })).toEqual({ width: 1, height: 1 });
    expect(cvPhotoDimensions({ data: JPEG_200X300, contentType: 'image/jpeg' })).toEqual({ width: 200, height: 300 });
    expect(cvPhotoDimensions({ data: Buffer.from([0xff, 0xd8, 0xff]), contentType: 'image/jpeg' })).toBeNull();
  });
});
