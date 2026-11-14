import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '../../../public/locales/en/common.json';
import Sidebar from './Sidebar';

let access: { isSuccess: boolean; data?: { enabled: boolean } } = { isSuccess: false };
let switchOn = true;
let pathname = '/dashboard';
vi.mock('@/components/career/CareerServices', () => ({
  isCareerEnabled: () => switchOn,
  useCareerAccess: () => access,
}));
vi.mock('@/i18n/routing', () => ({
  usePathname: () => pathname,
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderSidebar() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <Sidebar open={false} onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  access = { isSuccess: false };
  switchOn = true;
  pathname = '/dashboard';
  sessionStorage.clear();
});

describe('dashboard sidebar: career entry points', () => {
  it('offers "Add career tools" to someone without career access when the build switch is on', () => {
    access = { isSuccess: true, data: { enabled: false } };
    renderSidebar();
    expect(screen.getByRole('link', { name: 'Add career tools' }).getAttribute('href')).toBe('/career/plans');
    expect(screen.queryByRole('link', { name: 'Career Tools' })).toBeNull();
  });

  it('shows the career area instead once access is enabled', () => {
    access = { isSuccess: true, data: { enabled: true } };
    renderSidebar();
    expect(screen.getByRole('link', { name: en.dashboard.career_tools }).getAttribute('href')).toBe('/career');
    expect(screen.queryByRole('link', { name: 'Add career tools' })).toBeNull();
  });

  it('shows neither while the access check is pending or failed, nor with the switch off', () => {
    access = { isSuccess: false };
    const { unmount } = renderSidebar();
    expect(screen.queryByRole('link', { name: 'Add career tools' })).toBeNull();
    unmount();
    switchOn = false;
    access = { isSuccess: true, data: { enabled: false } };
    renderSidebar();
    expect(screen.queryByRole('link', { name: 'Add career tools' })).toBeNull();
  });
});

describe('dashboard sidebar: Templates stays in the app', () => {
  const templatesLink = () => screen.getByRole('link', { name: en.dashboard.templates });

  it('links to the in-app template gallery, not the public /templates page', () => {
    renderSidebar();
    expect(templatesLink().getAttribute('href')).toBe('/cv/new/pick-template');
  });

  it('seeds the default CV title the gallery needs, so it does not bounce to /cv/new', () => {
    renderSidebar();
    fireEvent.click(templatesLink());
    expect(JSON.parse(sessionStorage.getItem('cv_new_draft') ?? '{}')).toEqual({ title: en.cv_builder.untitled_cv });
  });

  it('keeps a title the user already typed on /cv/new', () => {
    sessionStorage.setItem('cv_new_draft', JSON.stringify({ title: 'Product CV' }));
    renderSidebar();
    fireEvent.click(templatesLink());
    expect(JSON.parse(sessionStorage.getItem('cv_new_draft') ?? '{}')).toEqual({ title: 'Product CV' });
  });

  it('highlights Templates, not My CVs, inside the gallery', () => {
    pathname = '/cv/new/pick-template';
    renderSidebar();
    expect(templatesLink().getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: en.dashboard.my_cvs }).getAttribute('aria-current')).toBeNull();
  });
});
