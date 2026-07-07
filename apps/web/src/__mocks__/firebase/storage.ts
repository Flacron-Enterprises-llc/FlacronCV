import { vi } from 'vitest';

export const getStorage = vi.fn(() => ({}));
export const ref = vi.fn();
export const uploadBytes = vi.fn();
export const getDownloadURL = vi.fn();
export const deleteObject = vi.fn();
