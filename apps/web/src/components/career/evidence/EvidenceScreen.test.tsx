import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, type CareerEvidence } from '@flacroncv/career-api-client';
import type { SignedInUser } from '@/lib/career/auth-gateway';
import { testApi } from '@/components/career/test-api';
import messages from '../../../../public/locales/en/common.json';
import { EvidenceScreen } from './EvidenceScreen';

const user: SignedInUser = {
  uid: 'ada',
  email: 'ada@example.test',
  emailVerified: true,
  getIdToken: async () => 'token',
};

const sampleEvidence: CareerEvidence = {
  id: '55555555-5555-4555-8555-555555555555',
  candidateAuthUserId: 'ada',
  title: 'Compiler Optimization Engine',
  description: 'Built high performance parser in Rust',
  evidenceType: 'project',
  ownershipStatement: 'Sole architect',
  linkedSkills: ['Rust', 'Compilers'],
  attachmentUrl: 'https://example.test/paper.pdf',
  attachmentName: 'paper.pdf',
  attachmentSizeBytes: 102400,
  attachmentStored: false,
  attachmentContentType: null,
  evidenceLabel: 'evidence_attached',
  verificationNotes: null,
  verifiedAt: null,
  verifierName: null,
  isPortfolioShared: true,
  createdAt: '2026-10-17T09:00:00.000Z',
  updatedAt: '2026-10-17T09:00:00.000Z',
};

function renderScreen(api = testApi()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <EvidenceScreen api={api} user={user} ready signInHref="/en/sign-in" />
    </NextIntlClientProvider>,
  );
}

describe('EvidenceScreen (CV11)', () => {
  it('shows empty state when no evidence exists and allows opening creation form', async () => {
    const api = testApi({
      evidence: vi.fn().mockResolvedValue({ items: [] }),
    });
    renderScreen(api);

    expect(await screen.findByText('No evidence items yet')).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Evidence Item' })[0]);
    expect(screen.getByText('New Evidence Item')).toBeDefined();
  });

  it('renders existing items with truthful badges, linked skills, and attachments', async () => {
    const api = testApi({
      evidence: vi.fn().mockResolvedValue({ items: [sampleEvidence] }),
    });
    renderScreen(api);

    expect(await screen.findByText('Compiler Optimization Engine')).toBeDefined();
    expect(screen.getByText('Evidence Attached')).toBeDefined();
    expect(screen.getByText('Rust')).toBeDefined();
    expect(screen.getByText('Compilers')).toBeDefined();
    expect(screen.getByText(/paper\.pdf/)).toBeDefined();
    expect(screen.getByText('Shared in Portfolio')).toBeDefined();
  });

  it('submits a new evidence item and updates the list', async () => {
    const createEvidence = vi.fn().mockResolvedValue({
      ...sampleEvidence,
      id: '66666666-6666-4666-8666-666666666666',
      title: 'New Distributed Ledger Project',
      evidenceLabel: 'self_reported',
      attachmentUrl: null,
    });
    const api = testApi({
      evidence: vi.fn().mockResolvedValue({ items: [] }),
      createEvidence,
    });
    renderScreen(api);

    // Open form
    const buttons = await screen.findAllByRole('button', { name: 'Add Evidence Item' });
    fireEvent.click(buttons[0]);

    // Fill form
    fireEvent.change(screen.getByLabelText(/Title/i), {
      target: { value: 'New Distributed Ledger Project' },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'Byzantine fault tolerant consensus' },
    });
    fireEvent.change(screen.getByLabelText(/Ownership \/ Personal Contribution/i), {
      target: { value: 'Lead author' },
    });

    // Save
    fireEvent.click(screen.getByRole('button', { name: 'Save Item' }));

    expect(createEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New Distributed Ledger Project',
        description: 'Byzantine fault tolerant consensus',
        ownershipStatement: 'Lead author',
      }),
    );
  });

  it('uploads a private file to an item and then offers download and removal', async () => {
    const linkOnly = { ...sampleEvidence, attachmentUrl: null, attachmentName: null, attachmentSizeBytes: null };
    const stored: CareerEvidence = {
      ...linkOnly,
      attachmentName: 'certificate.pdf',
      attachmentSizeBytes: 2048,
      attachmentStored: true,
      attachmentContentType: 'application/pdf',
    };
    const uploadEvidenceAttachment = vi.fn(async () => stored);
    const evidenceAttachmentLink = vi.fn(async () => ({ url: 'https://files.example.test/signed', expiresAt: '2026-10-17T09:05:00.000Z' }));
    const removeEvidenceAttachment = vi.fn(async () => linkOnly);
    const assign = vi.fn();
    const location = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...location, assign } });
    try {
      renderScreen(
        testApi({
          evidence: vi.fn(async () => ({ items: [linkOnly] })),
          uploadEvidenceAttachment,
          evidenceAttachmentLink,
          removeEvidenceAttachment,
        }),
      );
      const input = await screen.findByLabelText('Attach a file');
      const file = new File(['%PDF-1.7'], 'certificate.pdf', { type: 'application/pdf' });
      fireEvent.change(input, { target: { files: [file] } });
      expect(await screen.findByText(/certificate.pdf/)).toBeDefined();
      expect(uploadEvidenceAttachment).toHaveBeenCalledWith(linkOnly.id, file, 'certificate.pdf');
      expect(screen.getByText('2 KB')).toBeDefined();

      fireEvent.click(screen.getByRole('button', { name: 'Download file' }));
      await vi.waitFor(() => expect(assign).toHaveBeenCalledWith('https://files.example.test/signed'));
      expect(evidenceAttachmentLink).toHaveBeenCalledWith(linkOnly.id);

      const replacement = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'scan.png', { type: 'image/png' });
      fireEvent.change(screen.getByLabelText('Replace file'), { target: { files: [replacement] } });
      await vi.waitFor(() => expect(uploadEvidenceAttachment).toHaveBeenLastCalledWith(linkOnly.id, replacement, 'scan.png'));
      await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Remove file' })).toHaveProperty('disabled', false));

      fireEvent.click(screen.getByRole('button', { name: 'Remove file' }));
      expect(await screen.findByLabelText('Attach a file')).toBeDefined();
      expect(removeEvidenceAttachment).toHaveBeenCalledWith(linkOnly.id);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: location });
    }
  });

  it('explains a refused upload without changing the item', async () => {
    const linkOnly = { ...sampleEvidence, attachmentUrl: null, attachmentName: null, attachmentSizeBytes: null };
    const uploadEvidenceAttachment = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(409, 'capacity_exceeded', { code: 'capacity_exceeded', field: 'storageBytes', limit: 104857600 }))
      .mockRejectedValueOnce(new ApiError(400, 'validation_error', { code: 'validation_error', field: 'file', reason: 'type_mismatch' }))
      .mockRejectedValueOnce(new ApiError(413, 'validation_error', { code: 'validation_error' }));
    renderScreen(testApi({ evidence: vi.fn(async () => ({ items: [linkOnly] })), uploadEvidenceAttachment }));
    const input = await screen.findByLabelText('Attach a file');
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(messages.career.evidence.file_error_capacity)).toBeDefined();
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(messages.career.evidence.file_error_type)).toBeDefined();
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText(messages.career.evidence.file_error_too_large)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Download file' })).toBeNull();
  });
});
