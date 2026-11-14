import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A Storage upload that never progresses — what the SDK does while it silently
// retries an unreachable bucket.
const cancel = vi.fn();
let handlers: { error?: (e: unknown) => void; complete?: () => void } = {};

vi.mock('firebase/storage', () => ({
  ref: vi.fn(() => ({})),
  getDownloadURL: vi.fn(async () => 'https://storage.example/photo.jpg'),
  uploadBytesResumable: vi.fn(() => ({
    cancel,
    snapshot: { ref: {} },
    on: (_evt: string, _next: unknown, error: (e: unknown) => void, complete: () => void) => {
      handlers = { error, complete };
    },
  })),
}));

vi.mock('./firebase', () => ({
  storage: {},
  auth: { currentUser: { uid: 'u1' } },
}));

import { uploadCvPhotoBlob, PHOTO_UPLOAD_TIMEOUT_MS } from './upload-cv-photo';

describe('uploadCvPhotoBlob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    cancel.mockClear();
    handlers = {};
  });
  afterEach(() => vi.useRealTimers());

  it('gives up after the timeout and cancels the SDK task', async () => {
    const p = uploadCvPhotoBlob(new Blob(['x'], { type: 'image/jpeg' }));
    const assertion = expect(p).rejects.toThrow('PHOTO_UPLOAD_TIMEOUT');
    await vi.advanceTimersByTimeAsync(PHOTO_UPLOAD_TIMEOUT_MS + 1);
    await assertion;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('resolves with the download URL when the upload completes in time', async () => {
    const p = uploadCvPhotoBlob(new Blob(['x'], { type: 'image/jpeg' }));
    handlers.complete?.();
    await expect(p).resolves.toBe('https://storage.example/photo.jpg');
    // A late timer must not cancel a finished upload.
    await vi.advanceTimersByTimeAsync(PHOTO_UPLOAD_TIMEOUT_MS + 1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('tells a signed-out user apart from Storage being unavailable', async () => {
    const fb: any = await import('./firebase');
    const saved = fb.auth.currentUser;
    fb.auth.currentUser = null;
    await expect(uploadCvPhotoBlob(new Blob(['x']))).rejects.toThrow('PHOTO_SIGNED_OUT');
    fb.auth.currentUser = saved;
  });

  it('surfaces an SDK error immediately', async () => {
    const p = uploadCvPhotoBlob(new Blob(['x'], { type: 'image/jpeg' }));
    handlers.error?.(new Error('storage/unauthorized'));
    await expect(p).rejects.toThrow('storage/unauthorized');
  });
});
