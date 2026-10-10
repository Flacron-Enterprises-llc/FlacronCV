/** Storage rules reject objects over 5 MB. Resize first, then measure the JPEG. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ACCEPT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const ACCEPT_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']);

export class ImageUploadError extends Error {
  constructor(
    readonly code: 'INVALID_TYPE' | 'DECODE_FAILED' | 'TOO_LARGE',
    readonly sizeMb?: string,
  ) {
    super(code);
    this.name = 'ImageUploadError';
  }
}

export function isUploadableImage(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type) return ACCEPT_TYPES.has(type);
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ACCEPT_EXT.has(ext);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageUploadError('DECODE_FAILED'));
    img.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ImageUploadError('DECODE_FAILED'))),
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Decode, downscale, and encode as JPEG before the 5 MB Storage check.
 * Phone photos are often larger than 5 MB as files and small once scaled.
 * HEIC is attempted; browsers that cannot decode it fail with DECODE_FAILED.
 */
export async function fileToJpegBlob(file: File, maxEdge: number): Promise<Blob> {
  if (!isUploadableImage(file)) throw new ImageUploadError('INVALID_TYPE');

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    let edge = maxEdge;
    let quality = 0.88;
    let blob: Blob;
    do {
      const ratio = Math.min(edge / img.width, edge / img.height, 1);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * ratio));
      canvas.height = Math.max(1, Math.round(img.height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ImageUploadError('DECODE_FAILED');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      blob = await canvasToJpeg(canvas, quality);
      edge = Math.round(edge * 0.75);
      quality = Math.max(0.6, quality - 0.08);
    } while (blob.size > MAX_UPLOAD_BYTES && edge >= 240);
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new ImageUploadError('TOO_LARGE', (blob.size / (1024 * 1024)).toFixed(1));
    }
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
