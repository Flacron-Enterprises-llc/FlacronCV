import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/');
  });

  test('hero section is visible', async ({ page }) => {
    // Hero should be present in the viewport
    const hero = page.locator('section').first();
    await expect(hero).toBeVisible();
  });

  test('primary CTA navigates to the register page', async ({ page }) => {
    // Targets the LINK, not its label. The old version searched for the text
    // "Get Started", which this page has never rendered — the hero CTA reads
    // `hero.cta_primary` ("Start Building for Free") and Hero.tsx sets
    // `primaryHref = user ? '/dashboard' : '/register'`. Matching on href keeps
    // this test working when marketing copy is reworded, which is exactly the
    // kind of drift that broke it.
    const cta = page.locator('a[href$="/register"]').first();
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('pricing section is visible', async ({ page }) => {
    // Scroll to pricing section
    const pricing = page.locator('[id*="pricing"], section:has-text("Pricing"), section:has-text("Plan")').first();
    await pricing.scrollIntoViewIfNeeded();
    await expect(pricing).toBeVisible();
  });

  // Was 'testimonials section is visible'. The landing page has never had one —
  // page.tsx composes Navbar, Hero, Features, Pricing, HowItWorks, FAQ, Footer,
  // and testimonials live on their own route (/[locale]/testimonials, already
  // smoke-tested in public-pages.e2e.ts). The old test asserted a section that
  // does not exist, so it could only ever fail. These assert the sections the
  // page actually renders, by the ids the navbar anchors to.
  test.describe('landing sections render', () => {
    for (const id of ['features', 'how-it-works', 'faq']) {
      test(`#${id} section is visible`, async ({ page }) => {
        const section = page.locator(`section#${id}`);
        await section.scrollIntoViewIfNeeded();
        await expect(section).toBeVisible();
      });
    }
  });

  test('navbar links are functional', async ({ page }) => {
    // Navbar should contain at least one navigation link
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
    const links = nav.getByRole('link');
    await expect(links.first()).toBeVisible();
  });
});

test.describe('Landing page — mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('hamburger menu opens and closes', async ({ page }) => {
    await page.goto('/en/');

    // Look for a hamburger/menu button (common patterns)
    const menuButton = page
      .getByRole('button', { name: /menu|hamburger|navigation/i })
      .or(page.locator('button[aria-label*="menu" i]'))
      .or(page.locator('[data-testid="mobile-menu-button"]'))
      .first();

    if (await menuButton.isVisible()) {
      await menuButton.click();
      // `/\/en\//` required a TRAILING SLASH, but next-intl normalises `/en/`
      // to `/en`, so this could never match however the menu behaved. The
      // assertion is also near-tautological — the real signal that the menu
      // works is that navigation links become reachable after the click.
      await expect(page).toHaveURL(/\/en(\/|$)/);
      await expect(page.locator('nav').getByRole('link').first()).toBeVisible();
    } else {
      // On some layouts the hamburger might not be needed — skip gracefully
      test.skip();
    }
  });
});
