import { describe, expect, it } from 'vitest';
import {
  addressedTo,
  buildCreatePayload,
  buildEditorUpdate,
  pickStyling,
  validateNewLetter,
} from './cover-letter-payload';
import {
  ACCENT_COLORS,
  COVER_LETTER_TEMPLATES,
  activeTemplateId,
  isFactoryColor,
  pickTemplate,
  templateById,
} from './cover-letter-options';
import { SubscriptionPlan } from '../types/enums';

const emptyForm = { title: '', recipientName: '', companyName: '', jobTitle: '', jobDescription: '', linkedCVId: '' };

describe('buildEditorUpdate', () => {
  const letter = {
    title: 'Letter',
    recipientName: 'Jane',
    recipientTitle: undefined,
    companyName: 'Acme',
    companyAddress: '1 Road',
    jobTitle: 'Dev',
    jobDescription: 'JD',
    templateId: 'classic',
    styling: { fontFamily: 'Inter', fontSize: '16px', primaryColor: '#1e3a5f', senderName: 'Me', legacyKey: 'x' } as never,
  };

  it('sends the letter details, template and whitelisted styling, never status/content by default', () => {
    const body = buildEditorUpdate(letter);
    expect(body).toEqual({
      title: 'Letter',
      recipientName: 'Jane',
      companyName: 'Acme',
      companyAddress: '1 Road',
      jobTitle: 'Dev',
      jobDescription: 'JD',
      templateId: 'classic',
      styling: { fontFamily: 'Inter', fontSize: '16px', primaryColor: '#1e3a5f', senderName: 'Me' },
    });
    expect('content' in body).toBe(false);
    expect('status' in body).toBe(false);
  });

  it('adds content only when given (including an empty string)', () => {
    expect(buildEditorUpdate(letter, '<p>x</p>').content).toBe('<p>x</p>');
    expect(buildEditorUpdate(letter, '').content).toBe('');
  });

  it('pickStyling drops unknown keys and non-strings', () => {
    expect(pickStyling({ primaryColor: '#000', senderEmail: 'a@b.c', foo: 1, fontSize: 12 } as never)).toEqual({
      primaryColor: '#000',
      senderEmail: 'a@b.c',
    });
    expect(pickStyling(null)).toEqual({});
  });
});

describe('create form', () => {
  it('trims and omits blank optional fields (web create payload)', () => {
    expect(
      buildCreatePayload({ ...emptyForm, title: ' T ', companyName: ' Acme ', linkedCVId: 'cv1', jobTitle: '  ' }),
    ).toEqual({ title: 'T', companyName: 'Acme', linkedCVId: 'cv1' });
  });

  it('validates with the web copy', () => {
    expect(validateNewLetter(emptyForm, 'blank')).toBe('Title is required');
    expect(validateNewLetter({ ...emptyForm, title: 'T' }, 'blank')).toBeNull();
    expect(validateNewLetter({ ...emptyForm, title: 'T', jobTitle: 'Dev' }, 'ai')).toBe(
      'Company name and job title are required for AI generation',
    );
    expect(validateNewLetter({ ...emptyForm, title: 'T', jobTitle: 'Dev', companyName: 'Acme' }, 'ai')).toBeNull();
  });

  it('summarises who the letter is addressed to', () => {
    expect(addressedTo({ recipientName: ' Jane ', companyName: 'Acme' })).toBe('Jane · Acme');
    expect(addressedTo({ recipientName: '', companyName: '' })).toBe('');
  });
});

describe('template options (web registry)', () => {
  it('has the six web templates with web tiers and colours', () => {
    expect(COVER_LETTER_TEMPLATES.map((t) => [t.id, t.tier, t.defaultColor])).toEqual([
      ['classic', SubscriptionPlan.FREE, '#1e3a5f'],
      ['modern', SubscriptionPlan.FREE, '#2563eb'],
      ['minimalist', SubscriptionPlan.PRO, '#374151'],
      ['creative', SubscriptionPlan.PRO, '#7c3aed'],
      ['corporate', SubscriptionPlan.ENTERPRISE, '#0f766e'],
      ['executive', SubscriptionPlan.ENTERPRISE, '#0c0c0c'],
    ]);
    expect(ACCENT_COLORS).toHaveLength(8);
  });

  it('treats missing / standard as Modern', () => {
    expect(activeTemplateId(undefined)).toBe('modern');
    expect(activeTemplateId('standard')).toBe('modern');
    expect(templateById('creative')?.name).toBe('Creative');
  });

  it('adopts the template colour only over a factory colour', () => {
    const creative = templateById('creative')!;
    expect(isFactoryColor('#2563EB')).toBe(true);
    expect(isFactoryColor('')).toBe(true);
    expect(isFactoryColor('#dc2626')).toBe(false);
    expect(pickTemplate(creative, { fontFamily: '', fontSize: '', primaryColor: '#2563eb' })).toEqual({
      templateId: 'creative',
      primaryColor: '#7c3aed',
    });
    expect(pickTemplate(creative, { fontFamily: '', fontSize: '', primaryColor: '#dc2626' })).toEqual({
      templateId: 'creative',
      primaryColor: null,
    });
  });
});
