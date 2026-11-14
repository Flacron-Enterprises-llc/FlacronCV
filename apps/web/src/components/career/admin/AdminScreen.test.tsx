import { fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { AdminScreen } from './AdminScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

function renderAdmin(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <AdminScreen api={api} user={user} ready signInHref="/en/sign-in" />
    </NextIntlClientProvider>,
  );
}

describe('AdminScreen', () => {
  it('shows permission denied and does not offer a price', async () => {
    const api = testApi({
      adminCatalog: vi.fn().mockRejectedValue(new ApiError(403, 'permission_denied', { code: 'permission_denied' })),
      adminFlags: vi.fn().mockRejectedValue(new ApiError(403, 'permission_denied', { code: 'permission_denied' })),
      adminHealth: vi.fn().mockRejectedValue(new ApiError(403, 'permission_denied', { code: 'permission_denied' })),
      adminAudit: vi.fn().mockRejectedValue(new ApiError(403, 'permission_denied', { code: 'permission_denied' })),
      adminModerationQueue: vi.fn().mockRejectedValue(new ApiError(403, 'permission_denied', { code: 'permission_denied' })),
    });
    renderAdmin(api);
    expect(await screen.findByText('This account is not an operator')).toBeTruthy();
    expect(screen.queryByText(/price/i)).toBeNull();
  });

  it('lists unconfigured providers and toggles a flag without a price field', async () => {
    const setAdminFlag = vi.fn().mockResolvedValue({
      items: [{ feature: 'documentCredits', enabled: false, source: 'flag' }],
    });
    const api = testApi({
      adminCatalog: vi.fn().mockResolvedValue({ items: [{ version: '2026-10-10', publishedAt: '2026-10-10T00:00:00.000Z' }] }),
      adminFlags: vi.fn().mockResolvedValue({ items: [{ feature: 'documentCredits', enabled: true, source: 'phase' }] }),
      adminHealth: vi.fn().mockResolvedValue({ providers: [{ name: 'stripe', status: 'unconfigured' }] }),
      adminAudit: vi.fn().mockResolvedValue({ items: [{ id: 'a1', actorAuthUserId: 'ada', action: 'catalog.unchanged', target: '2026-10-10', createdAt: '2026-10-17T00:00:00.000Z' }] }),
      adminModerationQueue: vi.fn().mockResolvedValue({ items: [] }),
      setAdminFlag,
    });
    renderAdmin(api);
    expect(await screen.findByText('Stripe payments')).toBeTruthy();
    expect(screen.getByText('Unconfigured')).toBeTruthy();
    expect(screen.getByText('2026-10-10')).toBeTruthy();
    expect(screen.getByText('Catalog checked, no change')).toBeTruthy();
    // The only text fields belong to the evidence-verification tool; none takes a price.
    expect(screen.queryByRole('textbox', { name: /price|amount|cents/i })).toBeNull();
    const toggle = screen.getByRole('switch', { name: 'Document credits' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    // A switch asks before it changes what every customer can do.
    expect(setAdminFlag).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Turn off' }));
    await vi.waitFor(() => expect(screen.getByRole('switch', { name: 'Document credits' }).getAttribute('aria-checked')).toBe('false'));
    expect(setAdminFlag).toHaveBeenCalledWith('documentCredits', false);
    expect(screen.getByText('No listings are waiting for review.')).toBeTruthy();
  });

  it('saves a removal only after the review request succeeds', async () => {
    let release: (value: { opportunityId: string; moderationStatus: 'suppressed' }) => void = () => undefined;
    const adminModerateOpportunity = vi.fn(() => new Promise<{ opportunityId: string; moderationStatus: 'suppressed' }>((resolve) => {
      release = resolve;
    }));
    const api = testApi({
      adminCatalog: vi.fn().mockResolvedValue({ items: [] }),
      adminFlags: vi.fn().mockResolvedValue({ items: [] }),
      adminHealth: vi.fn().mockResolvedValue({ providers: [] }),
      adminAudit: vi.fn().mockResolvedValue({ items: [] }),
      adminModerationQueue: vi.fn().mockResolvedValue({
        items: [{
          opportunityId: '11111111-1111-4111-8111-111111111111',
          title: 'Fee desk',
          organization: 'Northwind',
          provider: 'adzuna',
          moderationStatus: 'flagged',
          reportCount: 2,
          latestReportAt: '2026-10-17T00:00:00.000Z',
          latestReasons: ['suspicious_fee'],
          reportNotes: ['They asked for a wire transfer.'],
          checkedAt: '2026-10-16T00:00:00.000Z',
        }],
      }),
      adminModerateOpportunity,
    });
    renderAdmin(api);
    expect(await screen.findByRole('heading', { name: 'Fee desk' })).toBeTruthy();
    expect(screen.getByText(/wire transfer/)).toBeTruthy();
    expect(screen.queryByText(/fraud/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove from search' }));
    expect(screen.queryByText('The review was saved.')).toBeNull();
    expect(adminModerateOpportunity).toHaveBeenCalledTimes(1);
    release({ opportunityId: '11111111-1111-4111-8111-111111111111', moderationStatus: 'suppressed' });
    expect(await screen.findByText('The review was saved.')).toBeTruthy();
    expect(screen.getByText('Removed from search')).toBeTruthy();
  });

  it('looks up an evidence item and records an issuer check with every required field', async () => {
    const item = { id: '44444444-4444-4444-8444-444444444444', title: 'AWS cert', evidenceType: 'credential', evidenceLabel: 'evidence_attached', verifications: [] };
    const recordEvidenceVerification = vi.fn().mockResolvedValue({ ...item, evidenceLabel: 'issuer_verified' });
    const api = testApi({
      adminCatalog: vi.fn().mockResolvedValue({ items: [] }),
      adminFlags: vi.fn().mockResolvedValue({ items: [] }),
      adminHealth: vi.fn().mockResolvedValue({ providers: [] }),
      adminAudit: vi.fn().mockResolvedValue({ items: [] }),
      adminModerationQueue: vi.fn().mockResolvedValue({ items: [] }),
      adminBusiness: vi.fn().mockResolvedValue({ items: [{ workspaceId: 'ws-1', staff: { manager: 1, counselor: 2, billing_admin: 0 }, pendingStaffInvites: 1, candidates: { invited: 3, active: 4, archived: 0 }, pendingCandidateInvites: 2, expiredInvites: 0 }] }),
      adminEvidence: vi.fn().mockResolvedValue(item),
      recordEvidenceVerification,
    });
    renderAdmin(api);
    expect(await screen.findByText('1 managers · 2 counsellors · 0 billing')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Evidence item ID'), { target: { value: item.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('AWS cert')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Record check' }));
    expect(await screen.findByText(/Check the fields/)).toBeTruthy();
    expect(recordEvidenceVerification).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Checked on'), { target: { value: '2026-11-10' } });
    fireEvent.change(screen.getByLabelText('Issuer or assessment name'), { target: { value: 'AWS' } });
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'Certificate number' } });
    fireEvent.change(screen.getByLabelText('Permission evidence'), { target: { value: 'Consent 2026-11-09' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record check' }));
    expect(await screen.findByText('Check recorded and audited.')).toBeTruthy();
    expect(recordEvidenceVerification).toHaveBeenCalledWith(item.id, expect.objectContaining({ label: 'issuer_verified', method: 'issuer_registry', checkedOn: '2026-11-10', expiresOn: null }));
  });
});
