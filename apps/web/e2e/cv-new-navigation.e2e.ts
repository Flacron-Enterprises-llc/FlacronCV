/**
 * E2E tests: Create New CV — navigation and state persistence
 *
 * Covers:
 * - Cancel button navigates away (back or /dashboard fallback)
 * - Template selection is preserved in the URL on selection
 * - Title draft is restored from sessionStorage on Back → Forward
 * - Create CV form validates title before submitting
 * - Successful creation redirects to the editor
 */

import { test, expect, Page } from '@playwright/test';
import { loginAsUser, mockApiRoute } from './fixtures/auth';

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const MOCK_TEMPLATES = [
  { id: 'tmpl-1', slug: 'classic',  name: 'Classic',  category: 'cv', tier: 'free',  description: 'Clean classic layout' },
  { id: 'tmpl-2', slug: 'modern',   name: 'Modern',   category: 'cv', tier: 'free',  description: 'Modern sidebar layout' },
  { id: 'tmpl-3', slug: 'creative', name: 'Creative', category: 'cv', tier: 'pro',   description: 'Creative top-bar layout' },
];

async function goToNewCV(page: Page) {
  await loginAsUser(page);
  await mockApiRoute(page, '/templates', MOCK_TEMPLATES);
  await page.goto('/en/cv/new');
  // Wait for the template grid to render
  await page.waitForSelector('[data-testid="cv-title-input"]', { timeout: 15000 });
}

// ---------------------------------------------------------------------------
// Cancel button navigation
// ---------------------------------------------------------------------------

test.describe('Cancel button', () => {
  test('navigates back when browser history exists', async ({ page }) => {
    await loginAsUser(page);
    await mockApiRoute(page, '/templates', MOCK_TEMPLATES);

    // Establish a history entry before landing on /cv/new
    await page.goto('/en/dashboard');
    await page.goto('/en/cv/new');
    await page.waitForSelector('[data-testid="cancel-btn"]');

    await page.click('[data-testid="cancel-btn"]');
    await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 8000 });
  });

  test('falls back to /dashboard when there is no prior history', async ({ page }) => {
    await loginAsUser(page);
    await mockApiRoute(page, '/templates', MOCK_TEMPLATES);

    // Navigate directly — no prior history entry
    await page.goto('/en/cv/new');
    await page.waitForSelector('[data-testid="cancel-btn"]');

    // Override history.length to simulate no prior history
    await page.evaluate(() => {
      Object.defineProperty(window.history, 'length', { value: 1, configurable: true });
    });

    await page.click('[data-testid="cancel-btn"]');
    await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 8000 });
  });
});

// ---------------------------------------------------------------------------
// Template selection synced to URL
// ---------------------------------------------------------------------------

test.describe('Template URL state', () => {
  test('selecting a template updates the URL query param', async ({ page }) => {
    await goToNewCV(page);

    // Click the "Modern" template card
    await page.getByRole('button', { name: /modern/i }).click();

    // URL should now contain ?template=modern (may be async, give it a moment)
    await expect(async () => {
      expect(page.url()).toContain('template=modern');
    }).toPass({ timeout: 2000 });
  });

  test('pre-selects the template from URL on load', async ({ page }) => {
    await loginAsUser(page);
    await mockApiRoute(page, '/templates', MOCK_TEMPLATES);

    // Navigate with pre-selected template in URL
    await page.goto('/en/cv/new?template=modern');
    await page.waitForSelector('[data-testid="cv-title-input"]', { timeout: 15000 });

    // The Modern card should have the selected ring/border class
    const modernCard = page.getByRole('button', { name: /modern/i });
    await expect(modernCard).toHaveClass(/border-brand/);
  });
});

// ---------------------------------------------------------------------------
// Title draft persistence (sessionStorage)
// ---------------------------------------------------------------------------

test.describe('Title draft persistence', () => {
  test('restores draft title after navigating back and forward', async ({ page }) => {
    await goToNewCV(page);

    // Type a title
    await page.fill('[data-testid="cv-title-input"]', 'My Senior Engineer CV');

    // Navigate away (simulate back button scenario)
    await page.goto('/en/dashboard');

    // Navigate forward back to /cv/new — sessionStorage persists within the tab
    await page.goto('/en/cv/new');
    await page.waitForSelector('[data-testid="cv-title-input"]');

    // Draft title should be restored
    await expect(page.locator('[data-testid="cv-title-input"]')).toHaveValue('My Senior Engineer CV');
  });

  test('draft is cleared after successful CV creation', async ({ page }) => {
    await goToNewCV(page);
    await mockApiRoute(page, '/cvs', { id: 'cv-new-1', title: 'Test CV' }, 201);
    // Mock the editor page API calls
    await mockApiRoute(page, '/cvs/cv-new-1', { id: 'cv-new-1', title: 'Test CV' });
    await mockApiRoute(page, '/cvs/cv-new-1/sections', []);

    await page.fill('[data-testid="cv-title-input"]', 'Test CV');
    await page.click('[data-testid="create-cv-btn"]');

    // After redirect to editor, draft must be gone from sessionStorage
    await page.waitForURL(/\/en\/cv\/cv-new-1/, { timeout: 10000 });

    const draft = await page.evaluate(() => sessionStorage.getItem('cv_new_draft'));
    expect(draft).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------

test.describe('Form validation', () => {
  test('shows an error and does not submit when title is empty', async ({ page }) => {
    await goToNewCV(page);

    // Leave title blank and submit
    await page.click('[data-testid="create-cv-btn"]');

    // A toast error should appear
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 3000 });
    // Still on the same page
    await expect(page).toHaveURL(/\/en\/cv\/new/);
  });
});

// ---------------------------------------------------------------------------
// Successful creation flow
// ---------------------------------------------------------------------------

test('Create CV redirects to the editor page on success', async ({ page }) => {
  await goToNewCV(page);
  await mockApiRoute(page, '/cvs', { id: 'cv-abc', title: 'My CV' }, 201);
  await mockApiRoute(page, '/cvs/cv-abc', { id: 'cv-abc', title: 'My CV' });
  await mockApiRoute(page, '/cvs/cv-abc/sections', []);

  await page.fill('[data-testid="cv-title-input"]', 'My CV');
  await page.click('[data-testid="create-cv-btn"]');

  await expect(page).toHaveURL(/\/en\/cv\/cv-abc/, { timeout: 10000 });
});
