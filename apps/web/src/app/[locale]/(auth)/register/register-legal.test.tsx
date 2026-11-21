import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import en from '../../../../../public/locales/en/common.json';

const loginWithGoogle = vi.hoisted(() => vi.fn());
const register = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => ({ currentUser: null as { uid: string } | null }));

vi.mock('@/providers/AuthProvider', () => ({
  useAuth: () => ({
    register,
    loginWithGoogle,
    user: null,
    loading: false,
  }),
  GOOGLE_ERROR_KEY: 'flacroncv_google_error',
}));

vi.mock('@/lib/firebase', () => ({
  auth: authMock,
  isConfigured: true,
  googleProvider: {},
}));

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: import('react').ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/current-user-role', () => ({ currentUserRole: vi.fn(async () => null) }));
vi.mock('@/lib/post-auth-redirect', () => ({ getPostLoginRedirect: () => '/dashboard' }));

import RegisterPage from './page';

function renderRegister() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <RegisterPage />
    </NextIntlClientProvider>,
  );
}

describe('register legal gate (option A — modal before Auth)', () => {
  beforeEach(() => {
    loginWithGoogle.mockReset();
    register.mockReset();
    authMock.currentUser = null;
    sessionStorage.clear();
  });

  it('does not start Google Auth when Continue with Google is clicked — the modal comes first', async () => {
    const user = userEvent.setup();
    renderRegister();
    await user.click(screen.getByRole('button', { name: /Google/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(loginWithGoogle).not.toHaveBeenCalled();
    expect(authMock.currentUser).toBeNull();
  });

  it('Cancel on the Google path leaves NO Firebase Auth user (the option-B failure mode)', async () => {
    const user = userEvent.setup();
    renderRegister();
    await user.click(screen.getByRole('button', { name: /Google/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(loginWithGoogle).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
    expect(authMock.currentUser).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not call register() until the modal is accepted', async () => {
    const user = userEvent.setup();
    renderRegister();
    await user.type(screen.getByLabelText('Full Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Email Address'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'Mango-Tree-42');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(register).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(register).not.toHaveBeenCalled();
  });

  it('stops a common password before the legal step, under the field', async () => {
    const user = userEvent.setup();
    renderRegister();
    await user.type(screen.getByLabelText('Full Name'), 'Ada Lovelace');
    await user.type(screen.getByLabelText('Email Address'), 'ada@example.com');
    await user.type(screen.getByLabelText('Password'), 'password1');
    // The meter already says so while typing…
    expect(screen.getAllByText(en.auth.password_common).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Create Account' }));
    // …and submitting neither opens the legal modal nor creates an account.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('offers a one-click fix for a mistyped email provider', async () => {
    const user = userEvent.setup();
    renderRegister();
    await user.type(screen.getByLabelText('Email Address'), 'ada@gmial.com');
    await user.click(screen.getByRole('button', { name: 'ada@gmail.com' }));
    expect(screen.getByLabelText('Email Address')).toHaveValue('ada@gmail.com');
  });
});
