import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { CareerEvidence } from '../../../../../packages/career-api-client/src/types';
import {
  EMPTY_EVIDENCE_FORM,
  EVIDENCE_TYPE_OPTIONS,
  EVIDENCE_PICKER_TYPES,
  EVIDENCE_UPLOAD_MAX_BYTES,
  MOBILE_UPLOAD_TYPES,
  UPLOAD_TOO_LARGE,
  UPLOAD_WRONG_TYPE,
  checkUploadSize,
  evidenceFileErrorMessage,
  evidenceFormDirty,
  evidenceLabelLimit,
  evidenceLabelView,
  needsRedactionConfirm,
  toggleFactId,
  verificationRows,
  evidenceSaveErrorMessage,
  formFromEvidence,
  formatBytes,
  parseSkills,
  planFileUpload,
  planImageUpload,
  toCreateEvidenceInput,
  toUpdateEvidenceInput,
  uploadFileName,
  uploadWrongFileTypeMessage,
  validateEvidenceForm,
} from './evidence';

const item: CareerEvidence = {
  id: 'e1',
  candidateAuthUserId: 'u1',
  title: 'Compiler',
  description: 'A toy compiler',
  evidenceType: 'project',
  ownershipStatement: 'Sole author',
  linkedSkills: ['Rust', 'LLVM'],
  attachmentUrl: 'https://example.com/repo',
  attachmentName: 'repo',
  attachmentSizeBytes: null,
  attachmentStored: false,
  attachmentContentType: null,
  evidenceLabel: 'self_reported',
  verificationNotes: null,
  verifiedAt: null,
  verifierName: null,
  isPortfolioShared: true,
  linkedFactIds: ['f1'],
  confidential: false,
  redactionNote: null,
  redactionConfirmedAt: null,
  verifications: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('evidence view', () => {
  it('lists the five API types in order', () => {
    expect(EVIDENCE_TYPE_OPTIONS.map((o) => o.value)).toEqual(['project', 'credential', 'work_sample', 'reference', 'publication']);
  });

  it('labels never claim more than the API says', () => {
    expect(evidenceLabelView('self_reported').text).toBe('SELF-REPORTED');
    expect(evidenceLabelView('evidence_attached').text).toBe('EVIDENCE ATTACHED');
    expect(evidenceLabelView('issuer_verified').tone).toBe('success');
    expect(evidenceLabelView('unknown').text).toBe('SELF-REPORTED');
  });

  it('formats sizes in decimal units like the website', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(200)).toBe('1 KB');
    expect(formatBytes(45_600)).toBe('46 KB');
    expect(formatBytes(2_500_000)).toBe('2.5 MB');
  });

  it('splits skills on commas and drops blanks', () => {
    expect(parseSkills(' TypeScript, ,PostgreSQL ,')).toEqual(['TypeScript', 'PostgreSQL']);
  });
});

describe('evidence form', () => {
  it('requires a title and enforces the API limits', () => {
    expect(validateEvidenceForm(EMPTY_EVIDENCE_FORM).title).toBe('Enter a title.');
    const long = validateEvidenceForm({ ...EMPTY_EVIDENCE_FORM, title: 'x'.repeat(201), description: 'd'.repeat(4001), ownershipStatement: 'o'.repeat(2001), attachmentName: 'n'.repeat(256) });
    expect(Object.keys(long).sort()).toEqual(['attachmentName', 'description', 'ownershipStatement', 'title']);
    expect(validateEvidenceForm({ ...EMPTY_EVIDENCE_FORM, title: 'Ok' })).toEqual({});
  });

  it('accepts only http(s) links', () => {
    expect(validateEvidenceForm({ ...EMPTY_EVIDENCE_FORM, title: 'A', attachmentUrl: 'javascript:alert(1)' }).attachmentUrl).toBeDefined();
    expect(validateEvidenceForm({ ...EMPTY_EVIDENCE_FORM, title: 'A', attachmentUrl: 'example.com' }).attachmentUrl).toBeDefined();
    expect(validateEvidenceForm({ ...EMPTY_EVIDENCE_FORM, title: 'A', attachmentUrl: 'https://example.com/x' }).attachmentUrl).toBeUndefined();
  });

  it('builds the same create body as the website', () => {
    expect(
      toCreateEvidenceInput({ ...EMPTY_EVIDENCE_FORM, title: '  AWS cert ', evidenceType: 'credential', skillsText: 'AWS, Cloud', isPortfolioShared: true }),
    ).toEqual({
      title: 'AWS cert',
      evidenceType: 'credential',
      description: undefined,
      ownershipStatement: undefined,
      linkedSkills: ['AWS', 'Cloud'],
      attachmentUrl: undefined,
      attachmentName: undefined,
      isPortfolioShared: true,
    });
  });

  it('round-trips an item and detects edits', () => {
    const form = formFromEvidence(item);
    expect(form.skillsText).toBe('Rust, LLVM');
    expect(evidenceFormDirty(form, formFromEvidence(item))).toBe(false);
    expect(evidenceFormDirty({ ...form, title: 'Compiler ' }, form)).toBe(false);
    expect(evidenceFormDirty({ ...form, isPortfolioShared: false }, form)).toBe(true);
  });

  it('update clears text explicitly and leaves link fields alone while a file is stored', () => {
    const form = { ...formFromEvidence(item), description: '', attachmentUrl: '' };
    const body = toUpdateEvidenceInput(form, false);
    expect(body.description).toBe('');
    expect(body.attachmentUrl).toBeNull();
    expect('evidenceType' in body).toBe(false);
    const stored = toUpdateEvidenceInput(formFromEvidence({ ...item, attachmentStored: true }), true);
    expect('attachmentUrl' in stored).toBe(false);
    expect('attachmentName' in stored).toBe(false);
  });

  it('accepts http and https links only, without credentials (the API rule)', () => {
    const ok = { ...EMPTY_EVIDENCE_FORM, title: 'A' };
    expect(validateEvidenceForm({ ...ok, attachmentUrl: 'http://example.com/x' }).attachmentUrl).toBeUndefined();
    expect(validateEvidenceForm({ ...ok, attachmentUrl: 'data:text/html,hi' }).attachmentUrl).toBeDefined();
    expect(validateEvidenceForm({ ...ok, attachmentUrl: 'https://me:pw@example.com' }).attachmentUrl).toBeDefined();
    const refused = new ApiError(400, 'validation_error', { code: 'validation_error', field: 'attachmentUrl', reason: 'unsafe_url' });
    expect(evidenceSaveErrorMessage(refused)).toBe('Use a link that starts with https:// or http://.');
  });

  it('requires a redaction confirmation before a confidential item is shared', () => {
    const form = { ...formFromEvidence(item), confidential: true };
    expect(needsRedactionConfirm(form)).toBe(true);
    expect(validateEvidenceForm(form).redactionConfirmed).toBe('Confirm the redaction before sharing a confidential item.');
    expect(validateEvidenceForm({ ...form, isPortfolioShared: false }).redactionConfirmed).toBeUndefined();
    expect(validateEvidenceForm({ ...form, redactionConfirmed: true }).redactionConfirmed).toBeUndefined();
    const refused = new ApiError(400, 'validation_error', { code: 'validation_error', field: 'redactionConfirmed', reason: 'required' });
    expect(evidenceSaveErrorMessage(refused)).toBe('Confirm the redaction before sharing a confidential item.');
  });

  it('sends the redaction confirmation only when it changes', () => {
    const confirmed = { ...item, confidential: true, redactionNote: 'Names blurred', redactionConfirmedAt: '2026-02-01T00:00:00Z' };
    const base = formFromEvidence(confirmed);
    expect(base.redactionConfirmed).toBe(true);
    const unchanged = toUpdateEvidenceInput({ ...base, title: 'New' }, false, base);
    expect('redactionConfirmed' in unchanged).toBe(false);
    expect(unchanged).toMatchObject({ confidential: true, redactionNote: 'Names blurred', linkedFactIds: ['f1'] });
    const fresh = formFromEvidence(item);
    expect(toUpdateEvidenceInput({ ...fresh, confidential: true, redactionConfirmed: true }, false, fresh).redactionConfirmed).toBe(true);
    // Turning confidential off clears the note; the API then drops the confirmation itself.
    expect(toUpdateEvidenceInput({ ...base, confidential: false, redactionConfirmed: false }, false, base)).toMatchObject({
      confidential: false,
      redactionNote: null,
    });
    expect(
      toCreateEvidenceInput({ ...EMPTY_EVIDENCE_FORM, title: 'T', confidential: true, redactionNote: ' x ', redactionConfirmed: true, isPortfolioShared: true }),
    ).toMatchObject({ confidential: true, redactionNote: 'x', redactionConfirmed: true });
  });

  it('links facts, treating order as no change', () => {
    const form = formFromEvidence(item);
    expect(toggleFactId(form.linkedFactIds, 'f2')).toEqual(['f1', 'f2']);
    expect(evidenceFormDirty({ ...form, linkedFactIds: ['f1'] }, form)).toBe(false);
    expect(evidenceFormDirty({ ...form, linkedFactIds: ['f1', 'f2'] }, form)).toBe(true);
    expect(validateEvidenceForm({ ...form, linkedFactIds: Array.from({ length: 51 }, (_, i) => String(i)) }).linkedFactIds).toBeDefined();
    const refused = new ApiError(400, 'validation_error', { code: 'validation_error', field: 'linkedFactIds', reason: 'unknown' });
    expect(evidenceSaveErrorMessage(refused)).toContain('no longer exists');
  });

  it('shows the full verification history read-only, expired and revoked included', () => {
    const rows = verificationRows([
      {
        id: 'v2', label: 'issuer_verified', method: 'issuer_registry', checkedOn: '2026-03-01', scope: 'AWS SA Associate',
        issuerName: 'AWS', permissionEvidence: 'consent', expiresOn: '2029-03-01', revokedAt: null, revokedReason: null,
        recordedBy: 'operator', createdAt: '2026-03-01T00:00:00Z', active: true,
      },
      {
        id: 'v1', label: 'reference_confirmed', method: 'reference_contact', checkedOn: '2025-01-01', scope: 'Led the team',
        issuerName: 'J. Doe', permissionEvidence: 'consent', expiresOn: null, revokedAt: '2026-01-01T00:00:00Z', revokedReason: 'Withdrawn',
        recordedBy: 'operator', createdAt: '2025-01-01T00:00:00Z', active: false,
      },
      {
        id: 'v0', label: 'assessment_completed', method: 'assessment', checkedOn: '2020-01-01', scope: 'Test',
        issuerName: 'Board', permissionEvidence: 'consent', expiresOn: '2021-01-01', revokedAt: null, revokedReason: null,
        recordedBy: 'operator', createdAt: '2020-01-01T00:00:00Z', active: false,
      },
    ]);
    expect(rows.map((row) => row.status)).toEqual(['active', 'revoked', 'expired']);
    expect(rows[0]).toMatchObject({ label: 'ISSUER VERIFIED', statusText: null });
    expect(rows[0].lines).toEqual([
      'Checked on 2026-03-01 · Issuer register',
      'Issuer or assessment: AWS',
      'Covers: AWS SA Associate',
      'Valid until 2029-03-01',
    ]);
    expect(rows[1].statusText).toBe('Revoked');
    expect(rows[1].lines).toContain('Revoked: Withdrawn');
    expect(rows[2].statusText).toBe('Expired');
    expect(verificationRows(undefined)).toEqual([]);
    expect(evidenceLabelLimit('issuer_verified')).toContain('issuer');
    expect(evidenceLabelLimit('anything')).toBe('Your own statement. Nothing has been checked.');
  });

  it('hides the link of a stored file from the form', () => {
    const form = formFromEvidence({ ...item, attachmentStored: true, attachmentName: 'cert.png' });
    expect(form.attachmentUrl).toBe('');
    expect(form.attachmentName).toBe('');
  });
});

describe('photo upload checks', () => {
  it('accepts PNG and JPEG from the picker MIME type', () => {
    expect(planImageUpload({ uri: 'file:///a/IMG_1.JPG', mimeType: 'image/jpeg', fileName: 'IMG_1.JPG', fileSize: 1000 })).toEqual({
      ok: true,
      contentType: 'image/jpeg',
      fileName: 'IMG_1.jpg',
    });
    expect(planImageUpload({ uri: 'file:///a/scan.png', mimeType: 'image/png' })).toMatchObject({ ok: true, contentType: 'image/png', fileName: 'scan.png' });
    expect(planImageUpload({ uri: 'file:///a/x', mimeType: 'image/jpg' })).toMatchObject({ ok: true, contentType: 'image/jpeg' });
  });

  it('falls back to the extension only when no MIME type is given', () => {
    expect(planImageUpload({ uri: 'file:///a/photo.jpeg' })).toMatchObject({ ok: true, contentType: 'image/jpeg', fileName: 'photo.jpg' });
    expect(planImageUpload({ uri: 'file:///a/photo.heic' })).toEqual({ ok: false, message: UPLOAD_WRONG_TYPE });
  });

  it('refuses HEIC, GIF and video from the photo picker', () => {
    expect(planImageUpload({ uri: 'file:///a/x.heic', mimeType: 'image/heic' })).toEqual({ ok: false, message: UPLOAD_WRONG_TYPE });
    expect(planImageUpload({ uri: 'file:///a/x.png', mimeType: 'image/gif' }).ok).toBe(false);
    expect(planImageUpload({ uri: 'file:///a/x.pdf', mimeType: 'application/pdf' }).ok).toBe(false);
    expect(UPLOAD_WRONG_TYPE).toBe('Choose a PNG or JPEG photo.');
    expect(UPLOAD_WRONG_TYPE).not.toMatch(/website/);
  });

  it('refuses files over the 10 MiB API default', () => {
    expect(planImageUpload({ uri: 'file:///a/x.png', mimeType: 'image/png', fileSize: EVIDENCE_UPLOAD_MAX_BYTES + 1 })).toEqual({ ok: false, message: UPLOAD_TOO_LARGE });
    expect(planImageUpload({ uri: 'file:///a/x.png', mimeType: 'image/png', fileSize: EVIDENCE_UPLOAD_MAX_BYTES }).ok).toBe(true);
    expect(checkUploadSize(0)).toMatch(/empty/);
    expect(checkUploadSize(EVIDENCE_UPLOAD_MAX_BYTES + 1)).toBe(UPLOAD_TOO_LARGE);
    expect(checkUploadSize(1234)).toBeNull();
  });

  it('cleans the display name and sets the matching extension', () => {
    expect(uploadFileName('../dir/my "cert".jpeg', 'image/jpeg')).toBe('my cert.jpg');
    expect(uploadFileName('', 'image/png')).toBe('evidence.png');
    expect(uploadFileName('Offer letter.PDF', 'application/pdf')).toBe('Offer letter.pdf');
    expect(uploadFileName('ref', DOCX)).toBe('ref.docx');
  });
});

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('document upload checks', () => {
  it('offers and accepts the API and website list: PDF, PNG, JPEG, DOCX', () => {
    expect([...MOBILE_UPLOAD_TYPES].sort()).toEqual(['application/pdf', DOCX, 'image/jpeg', 'image/png'].sort());
    expect(EVIDENCE_PICKER_TYPES).toEqual([...MOBILE_UPLOAD_TYPES]);
    expect(planFileUpload({ uri: 'file:///c/cert.pdf', name: 'cert.pdf', mimeType: 'application/pdf', size: 2000 })).toEqual({
      ok: true,
      contentType: 'application/pdf',
      fileName: 'cert.pdf',
    });
    expect(planFileUpload({ uri: 'file:///c/x', name: 'Reference.docx', mimeType: DOCX })).toMatchObject({ ok: true, contentType: DOCX, fileName: 'Reference.docx' });
    expect(planFileUpload({ uri: 'file:///c/x', name: 'scan.jpg', mimeType: 'image/jpg' })).toMatchObject({ ok: true, contentType: 'image/jpeg', fileName: 'scan.jpg' });
  });

  it('uses the extension only when the picker type is missing or generic', () => {
    expect(planFileUpload({ uri: 'file:///c/a.docx', name: 'a.docx', mimeType: 'application/octet-stream' })).toMatchObject({ ok: true, contentType: DOCX });
    expect(planFileUpload({ uri: 'file:///c/a.pdf', name: 'a.pdf' })).toMatchObject({ ok: true, contentType: 'application/pdf' });
    expect(planFileUpload({ uri: 'file:///c/a.pdf', name: 'a.pdf', mimeType: 'text/plain' })).toEqual({ ok: false, message: uploadWrongFileTypeMessage() });
  });

  it('refuses other types and files over 10 MiB, without pointing to the website', () => {
    expect(planFileUpload({ uri: 'file:///c/a.doc', name: 'a.doc', mimeType: 'application/msword' })).toEqual({ ok: false, message: uploadWrongFileTypeMessage() });
    expect(planFileUpload({ uri: 'file:///c/a.heic', name: 'a.heic', mimeType: 'image/heic' }).ok).toBe(false);
    expect(uploadWrongFileTypeMessage()).toBe('Choose a PDF, Word (.docx), PNG or JPEG file.');
    expect(planFileUpload({ uri: 'file:///c/a.pdf', name: 'a.pdf', mimeType: 'application/pdf', size: EVIDENCE_UPLOAD_MAX_BYTES + 1 })).toEqual({
      ok: false,
      message: UPLOAD_TOO_LARGE,
    });
    expect(planFileUpload({ uri: 'file:///c/a.pdf', name: 'a.pdf', mimeType: 'application/pdf', size: EVIDENCE_UPLOAD_MAX_BYTES }).ok).toBe(true);
    expect(EVIDENCE_UPLOAD_MAX_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('error messages', () => {
  it('maps file errors like the website', () => {
    expect(evidenceFileErrorMessage(new ApiError(413, 'validation_error', { code: 'validation_error' }))).toBe(UPLOAD_TOO_LARGE);
    expect(evidenceFileErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', reason: 'too_large' } as never))).toBe(UPLOAD_TOO_LARGE);
    expect(evidenceFileErrorMessage(new ApiError(400, 'validation_error', { code: 'validation_error', reason: 'type_mismatch' } as never))).toMatch(/really be that type/);
    expect(evidenceFileErrorMessage(new ApiError(409, 'capacity_exceeded', { code: 'capacity_exceeded' }))).toMatch(/storage is full/);
    expect(evidenceFileErrorMessage(new ApiError(503, 'provider_unavailable', { code: 'provider_unavailable' }))).toMatch(/Nothing was charged/);
    expect(evidenceFileErrorMessage(new ApiError(0, 'network_error', { code: 'network_error' }))).toMatch(/No connection/);
  });

  it('maps save errors without offering a purchase', () => {
    const message = evidenceSaveErrorMessage(new ApiError(409, 'capacity_exceeded', { code: 'capacity_exceeded' }));
    expect(message).not.toMatch(/upgrade|buy|\$/i);
    expect(evidenceSaveErrorMessage(new Error('x'))).toMatch(/not saved/);
  });
});
