/**
 * E2E tests: CV photo upload validation
 *
 * Covers:
 * - Valid image formats (jpg, png, webp) are accepted silently
 * - Invalid file types (pdf, exe, txt, svg) are rejected with an error message
 * - Files exceeding the 5 MB limit are rejected with an error message
 * - The photoURL store value is NOT updated when an invalid file is provided
 */

import { test, expect, Page } from '@playwright/test';
import path from 'path';
import { loginAsUser, mockApiRoute } from './fixtures/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to the CV editor page and wait for it to be ready. */
async function goToCVEditor(page: Page) {
  // Mock the CVs list so the page loads without a real backend
  await mockApiRoute(page, '/cvs', []);
  await page.goto('/en/cv/new');
  // Wait for the photo upload button to appear
  await page.waitForSelector('[data-testid="photo-upload-btn"]', { timeout: 15000 });
}

/**
 * Trigger the hidden file input with a synthetic file of the given MIME type
 * and content size. Uses `page.dispatchEvent` so we can set an arbitrary MIME
 * type regardless of the OS file picker.
 */
async function uploadFile(
  page: Page,
  fileName: string,
  mimeType: string,
  sizeBytes: number = 1024,
) {
  const buffer = Buffer.alloc(sizeBytes, 0x00);

  await page.evaluate(
    ({ fileName, mimeType, buffer }) => {
      const input = document.querySelector<HTMLInputElement>(
        '[data-testid="photo-upload-input"]',
      );
      if (!input) throw new Error('photo-upload-input not found');

      const file = new File([new Uint8Array(buffer)], fileName, { type: mimeType });
      const dt = new DataTransfer();
      dt.items.add(file);
      // Assign files and fire change event
      Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { fileName, mimeType, buffer: Array.from(buffer) },
  );
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

test.beforeEach(async ({ page }) => {
  await loginAsUser(page);
  await goToCVEditor(page);
});

// ---------------------------------------------------------------------------
// Valid uploads — error must NOT appear
// ---------------------------------------------------------------------------

test.describe('Valid image uploads', () => {
  const validCases: Array<{ name: string; mime: string }> = [
    { name: 'photo.jpg',  mime: 'image/jpeg' },
    { name: 'photo.jpeg', mime: 'image/jpeg' },
    { name: 'photo.png',  mime: 'image/png'  },
    { name: 'photo.webp', mime: 'image/webp' },
  ];

  for (const { name, mime } of validCases) {
    test(`accepts ${name} (${mime})`, async ({ page }) => {
      await uploadFile(page, name, mime, 512 * 1024); // 512 KB

      // Error message must NOT appear
      await expect(page.locator('[data-testid="photo-upload-error"]')).not.toBeVisible();
    });
  }
});

// ---------------------------------------------------------------------------
// Invalid file type — error MUST appear; photo must NOT be set
// ---------------------------------------------------------------------------

test.describe('Invalid file type rejection', () => {
  const invalidCases: Array<{ name: string; mime: string }> = [
    { name: 'resume.pdf',    mime: 'application/pdf'        },
    { name: 'malware.exe',   mime: 'application/octet-stream' },
    { name: 'notes.txt',     mime: 'text/plain'              },
    { name: 'image.svg',     mime: 'image/svg+xml'           },
    { name: 'archive.zip',   mime: 'application/zip'         },
    { name: 'script.js',     mime: 'application/javascript'  },
    { name: 'data.json',     mime: 'application/json'        },
  ];

  for (const { name, mime } of invalidCases) {
    test(`rejects ${name} and shows error`, async ({ page }) => {
      await uploadFile(page, name, mime);

      // Inline error must appear
      const error = page.locator('[data-testid="photo-upload-error"]');
      await expect(error).toBeVisible({ timeout: 5000 });
      await expect(error).toContainText(/not supported|invalid/i);

      // The circular photo preview must NOT show an <img> tag (photo not set)
      const profileImg = page.locator('button.rounded-full img[alt="Profile"]');
      await expect(profileImg).not.toBeVisible();
    });
  }
});

// ---------------------------------------------------------------------------
// File size limit — files > 5 MB must be rejected
// ---------------------------------------------------------------------------

test.describe('File size limit', () => {
  test('rejects a JPEG that is 6 MB', async ({ page }) => {
    const SIX_MB = 6 * 1024 * 1024;
    await uploadFile(page, 'big-photo.jpg', 'image/jpeg', SIX_MB);

    const error = page.locator('[data-testid="photo-upload-error"]');
    await expect(error).toBeVisible({ timeout: 5000 });
    await expect(error).toContainText(/too large|5 MB/i);

    const profileImg = page.locator('button.rounded-full img[alt="Profile"]');
    await expect(profileImg).not.toBeVisible();
  });

  test('accepts a JPEG that is exactly at the 5 MB limit', async ({ page }) => {
    const FIVE_MB = 5 * 1024 * 1024;
    await uploadFile(page, 'ok-photo.jpg', 'image/jpeg', FIVE_MB);

    await expect(page.locator('[data-testid="photo-upload-error"]')).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Error is cleared on subsequent valid upload
// ---------------------------------------------------------------------------

test('error clears when a valid image is uploaded after an invalid one', async ({ page }) => {
  // First upload something invalid
  await uploadFile(page, 'bad.pdf', 'application/pdf');
  await expect(page.locator('[data-testid="photo-upload-error"]')).toBeVisible();

  // Then upload a valid image
  await uploadFile(page, 'good.jpg', 'image/jpeg', 200 * 1024);
  await expect(page.locator('[data-testid="photo-upload-error"]')).not.toBeVisible();
});
