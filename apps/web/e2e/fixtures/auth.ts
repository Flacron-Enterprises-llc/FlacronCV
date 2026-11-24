import { Page } from '@playwright/test';

const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1';

const FAKE_USER = {
  uid: 'e2e-test-uid',
  email: 'e2e@example.com',
  displayName: 'E2E Test User',
  photoURL: null,
  phoneNumber: null,
  role: 'user',
  subscription: { plan: 'free', status: 'active' },
  usage: { aiCreditsLimit: 5, aiCreditsUsed: 0 },
  isActive: true,
};

/**
 * Intercepts Firebase auth and backend verify requests with fake successful responses.
 * Call this before navigating to pages that trigger auth.
 */
export async function loginAsUser(page: Page, options: { uid?: string; email?: string } = {}) {
  const uid = options.uid ?? FAKE_USER.uid;
  const email = options.email ?? FAKE_USER.email;

  // Intercept Firebase Identity Toolkit REST calls (sign-in endpoints)
  await page.route('**/identitytoolkit.googleapis.com/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        idToken: buildFakeIdToken(uid, email),
        refreshToken: 'fake-refresh-token',
        expiresIn: '3600',
        localId: uid,
        email,
        displayName: FAKE_USER.displayName,
        registered: true,
      }),
    });
  });

  // Intercept backend verify call
  await page.route(`${API_BASE}/auth/verify`, (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { ...FAKE_USER, uid, email },
        timestamp: new Date().toISOString(),
      }),
    });
  });
}

/**
 * Intercepts any /api/v1{path} call with a canned response.
 */
export async function mockApiRoute(
  page: Page,
  path: string,
  data: unknown,
  status = 200,
) {
  await page.route(`${API_BASE}${path}`, (route) => {
    route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({
        success: status < 400,
        data,
        timestamp: new Date().toISOString(),
      }),
    });
  });
}

/**
 * Builds a fake (non-verifiable) JWT for use in E2E intercepts.
 * This is only used as a stub token value; the backend is mocked.
 */
function buildFakeIdToken(uid: string, email: string): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({
      uid,
      sub: uid,
      email,
      email_verified: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  );
  return `${header}.${payload}.fake-signature`;
}
