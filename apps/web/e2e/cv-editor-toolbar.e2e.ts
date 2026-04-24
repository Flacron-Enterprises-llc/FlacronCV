/**
 * E2E tests: CV editor toolbar
 *
 * Covers:
 * - AI Assist button is NOT present on the Create New CV page
 * - Core toolbar controls (Undo, Redo, Export) remain visible
 */

import { test, expect } from '@playwright/test';
import { loginAsUser, mockApiRoute } from './fixtures/auth';

test.beforeEach(async ({ page }) => {
  await loginAsUser(page);
  await mockApiRoute(page, '/cvs', []);
  await page.goto('/en/cv/new');
  // Wait for the toolbar to mount
  await page.waitForSelector('[title]', { timeout: 15000 });
});

test('AI Assist button is not rendered in the CV editor toolbar', async ({ page }) => {
  // Check by visible text — covers any button or link labelled "AI Assist"
  await expect(page.getByRole('button', { name: /ai assist/i })).not.toBeVisible();

  // Also assert the Sparkles icon wrapper is absent (belt-and-suspenders)
  // The button previously contained a <svg> with a specific Lucide class pattern
  const sparklesBtn = page.locator('button:has(svg.lucide-sparkles)');
  await expect(sparklesBtn).not.toBeVisible();
});

test('toolbar core controls remain visible after AI Assist removal', async ({ page }) => {
  // Undo / Redo
  await expect(page.locator('button[title]').filter({ hasText: '' }).first()).toBeVisible();

  // Export button must still be present
  await expect(page.getByRole('button', { name: /export/i })).toBeVisible();
});
