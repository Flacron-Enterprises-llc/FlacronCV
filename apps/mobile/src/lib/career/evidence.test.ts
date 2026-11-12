import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { CareerEvidence } from '../../../../../packages/career-api-client/src/types';
import {
  EMPTY_EVIDENCE_FORM,
  EVIDENCE_TYPE_OPTIONS,
  EVIDENCE_UPLOAD_MAX_BYTES,
  UPLOAD_TOO_LARGE,
  UPLOAD_WRONG_TYPE,
  checkUploadSize,
  evidenceFileErrorMessage,
  evidenceFormDirty,
  evidenceLabelView,
  evidenceSaveErrorMessage,
  formFromEvidence,
  formatBytes,
  parseSkills,
  planImageUpload,
  toCreateEvidenceInput,
  toUpdateEvidenceInput,
  uploadFileName,
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

  it('refuses HEIC, GIF and video, pointing PDFs to the website', () => {
    expect(planImageUpload({ uri: 'file:///a/x.heic', mimeType: 'image/heic' })).toEqual({ ok: false, message: UPLOAD_WRONG_TYPE });
    expect(planImageUpload({ uri: 'file:///a/x.png', mimeType: 'image/gif' }).ok).toBe(false);
    expect(UPLOAD_WRONG_TYPE).toMatch(/website/);
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
