import { describe, expect, it } from 'vitest';
import { isUploadableImage } from './prepare-image-upload';

function file(name: string, type: string): File {
  return new File([new Uint8Array([1])], name, { type });
}

describe('isUploadableImage', () => {
  it('accepts jpeg, png, webp, and heic', () => {
    expect(isUploadableImage(file('a.jpg', 'image/jpeg'))).toBe(true);
    expect(isUploadableImage(file('a.png', 'image/png'))).toBe(true);
    expect(isUploadableImage(file('a.webp', 'image/webp'))).toBe(true);
    expect(isUploadableImage(file('a.heic', 'image/heic'))).toBe(true);
    expect(isUploadableImage(file('a.heif', ''))).toBe(true);
  });

  it('rejects other types', () => {
    expect(isUploadableImage(file('a.gif', 'image/gif'))).toBe(false);
    expect(isUploadableImage(file('a.svg', 'image/svg+xml'))).toBe(false);
    expect(isUploadableImage(file('a.pdf', 'application/pdf'))).toBe(false);
  });
});
