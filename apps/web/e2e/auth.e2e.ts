import { test, expect } from '@playwright/test';
import { loginAsUser, mockApiRoute } from './fixtures/auth';

const PENDING_TEMPLATE_KEY = 'flacroncv_pending_template';

/**
 * Target the inputs by id, not by label.
 *
 * `getByLabel(/password/i)` matched TWO elements once the password-visibility
 * toggle was added — the input and the `aria-label="Show password"` button —
 * so every fill died on a Playwright strict-mode violation. The forms give each
 * field a stable id (`#name`, `#email`, `#password` in login/register), which is
 * both unambiguous and immune to label copy changes.
 */
const emailField = (page: import('@playwright/test').Page) => page.locator('input#email');
const passwordField = (page: import('@playwright/test').Page) => page.locator('input#password');

test.describe('Auth flows', () => {
  test('login flow redirects to dashboard', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/en/login');

    await emailField(page).fill('e2e@example.com');
    await passwordField(page).fill('Test1234!');
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 10000 });
  });

  test('register flow redirects to verify-email', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/en/register');

    await page.locator('input#name').fill('New User');
    await emailField(page).fill('e2e@example.com');
    // The register form has a single password field — there is no confirm
    // input, so the old count()/nth(1) branch was dead code guarding against a
    // field that does not exist.
    await passwordField(page).fill('Test1234!');
    await page.getByRole('button', { name: /sign up|register|create account/i }).click();

    await expect(page).toHaveURL(/\/en\/(verify-email|dashboard)/, { timeout: 10000 });
  });

  test('pending template redirect — login sends user to cv/new?template=modern', async ({ page }) => {
    await loginAsUser(page);

    // Set pending template in localStorage before navigating
    await page.goto('/en/login');
    await page.evaluate(
      ([key, value]) => localStorage.setItem(key, value),
      [PENDING_TEMPLATE_KEY, 'modern'],
    );

    await emailField(page).fill('e2e@example.com');
    await passwordField(page).fill('Test1234!');
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    await expect(page).toHaveURL(/\/en\/cv\/new\?template=modern/, { timeout: 10000 });
  });

  test('password reset page sends email and shows success', async ({ page }) => {
    await mockApiRoute(page, '/auth/reset-password', { message: 'Password reset email sent' });
    await page.goto('/en/forgot-password');

    await page.getByLabel(/email/i).fill('e2e@example.com');
    await page.getByRole('button', { name: /send|reset/i }).click();

    // Should show a success toast or message
    await expect(
      page.locator('[data-sonner-toast], [role="status"], .toast, [data-testid="success-toast"]').first()
        .or(page.getByText(/sent|check your email/i).first()),
    ).toBeVisible({ timeout: 5000 });
  });

  test('Firebase auth error shows error toast', async ({ page }) => {
    // Override Firebase to return an error
    await page.route('**/identitytoolkit.googleapis.com/**', (route) => {
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 400, message: 'EMAIL_NOT_FOUND', status: 'INVALID_ARGUMENT' },
        }),
      });
    });

    await page.goto('/en/login');
    await emailField(page).fill('wrong@example.com');
    await passwordField(page).fill('wrongpass');
    await page.getByRole('button', { name: /log in|sign in/i }).click();

    // Should show an error toast
    await expect(
      page
        .locator('[data-sonner-toast][data-type="error"], [role="alert"]')
        .first()
        .or(page.getByText(/invalid|error|not found|wrong/i).first()),
    ).toBeVisible({ timeout: 5000 });
  });
});
