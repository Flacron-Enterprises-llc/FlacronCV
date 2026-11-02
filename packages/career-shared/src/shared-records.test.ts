import { describe, expect, it } from 'vitest';
import {
  documentFromBody,
  letterHtmlToText,
  letterTextToHtml,
  parseSharedCvDocument,
  projectDocument,
  v1TemplateAfter,
  v2LetterTemplateFor,
  v2ResumeTemplateFor,
} from './shared-records';
import type { SharedCvDocument } from './shared-records';

/** Fictional V1-shaped CV, as V1's editor writes it. */
function v1Cv(): Record<string, unknown> {
  return {
    title: 'Ada CV',
    templateId: 'executive',
    status: 'draft',
    isPublic: false,
    publicSlug: null,
    personalInfo: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', city: 'London', headline: 'Analyst', summary: 'Wrote notes on the engine.', photoURL: null },
    sectionOrder: ['s-skills', 's-exp', 's-hidden'],
    styling: { primaryColor: '#123456', fontFamily: 'Inter', fontSize: 'medium', spacing: 'normal', showPhoto: false, layout: 'compact', sectionStyle: 'underline', borderRadius: 'none' },
    aiGenerated: false,
    aiProvider: null,
    sections: [
      {
        id: 's-exp',
        type: 'experience',
        title: 'Experience',
        isVisible: true,
        order: 0,
        items: [
          { id: 'e1', company: 'Analytical Engines Ltd', position: 'Analyst', location: 'London', startDate: '2020-01', endDate: null, isCurrent: true, description: 'Wrote the first program.', highlights: ['Bernoulli numbers'], order: 0 },
        ],
      },
      { id: 's-skills', type: 'skills', title: 'Skills', isVisible: true, order: 1, items: [{ id: 'k1', name: 'Mathematics', level: 'expert', category: 'Core', order: 0 }] },
      { id: 's-hidden', type: 'custom', title: 'Hidden', isVisible: false, order: 2, items: [{ id: 'c1', title: 'Secret', subtitle: '', date: '', description: 'Not shown', order: 0, futureV1Field: 'kept' }] },
    ],
  };
}

function parsed(input = v1Cv()): SharedCvDocument {
  const result = parseSharedCvDocument(input);
  if (!result.ok) throw new Error(`${result.field} ${result.reason}`);
  return result.document;
}

describe('shared CV documents', () => {
  it('keeps every V1 field, including one V2 does not know', () => {
    const document = parsed();
    expect(document.sections[2].items[0].futureV1Field).toBe('kept');
    expect(document.styling.layout).toBe('compact');
    expect(parseSharedCvDocument(JSON.parse(JSON.stringify(document)))).toEqual({ ok: true, document });
  });

  it('refuses malformed input instead of storing it', () => {
    expect(parseSharedCvDocument({ ...v1Cv(), title: '' })).toMatchObject({ ok: false, field: 'title' });
    expect(parseSharedCvDocument({ ...v1Cv(), templateId: '../x' })).toMatchObject({ ok: false, field: 'templateId' });
    const nested = v1Cv();
    (nested.sections as Array<{ items: unknown[] }>)[0].items[0] = { id: 'e1', company: { $gt: '' } };
    expect(parseSharedCvDocument(nested)).toMatchObject({ ok: false, field: 'sections.0.items.0.company' });
    const duplicate = v1Cv();
    (duplicate.sections as Array<{ id: string }>)[1].id = 's-exp';
    expect(parseSharedCvDocument(duplicate)).toMatchObject({ ok: false, field: 'sections.1.id' });
  });

  it('projects V2 lines in V1 order, without hidden sections', () => {
    const body = projectDocument(parsed(), 'executive');
    expect(body.sections.map((section) => section.factType)).toEqual(['contact', 'summary', 'skill', 'experience']);
    expect(body.sections[0].lines[0].text).toContain('Ada Lovelace');
    expect(body.sections[3].lines[0]).toMatchObject({ factId: 'doc:s-exp:e1', factType: 'experience' });
    expect(body.sections[3].lines[0].text).toContain('Analytical Engines Ltd');
    expect(body.sections[3].lines[0].text).toContain('Bernoulli numbers');
    expect(JSON.stringify(body)).not.toContain('Not shown');
  });

  it('maps template ids both ways without losing V1 rendering', () => {
    expect(v2ResumeTemplateFor({ templateId: 'executive', styling: {} })).toBe('executive');
    expect(v2ResumeTemplateFor({ templateId: 'custom-admin-1', styling: { layout: 'top-bar' } })).toBe('topbar');
    expect(v2ResumeTemplateFor({ templateId: 'custom-admin-1', styling: {} })).toBe('classic');
    expect(v1TemplateAfter('executive', 'modern')).toBe('modern');
    expect(v1TemplateAfter('executive', 'editorial')).toBe('executive');
    expect(v2LetterTemplateFor('standard')).toBe('modern');
    expect(v2LetterTemplateFor('corporate')).toBe('corporate');
    expect(v2LetterTemplateFor(null)).toBe('classic');
  });

  it('turns a fact-composed V2 version into a V1 document', () => {
    const facts = [
      { id: 'f-contact', factType: 'contact' as const, value: { fullName: 'Bea Fictional Example', email: 'bea@example.test' } },
      { id: 'f-exp', factType: 'experience' as const, value: { position: 'Engineer', company: 'Example Co', startDate: '2021-02-01', current: true, responsibilities: 'Built things.' } },
    ];
    const body = {
      templateId: 'editorial' as const,
      confirmation: 'draft' as const,
      sections: [
        { factType: 'contact' as const, lines: [{ factId: 'f-contact', factType: 'contact' as const, text: 'Bea Fictional Example', uncertain: false }] },
        { factType: 'experience' as const, lines: [{ factId: 'f-exp', factType: 'experience' as const, text: 'Engineer at Example Co, my own words', uncertain: false }] },
      ],
    };
    const document = documentFromBody(body, facts, { title: 'Bea CV' });
    expect(document.templateId).toBe('classic');
    expect(document.personalInfo).toMatchObject({ firstName: 'Bea', lastName: 'Fictional Example', email: 'bea@example.test' });
    expect(document.sections[0]).toMatchObject({ type: 'experience' });
    expect(document.sections[0].items[0]).toMatchObject({ position: 'Engineer', company: 'Example Co', isCurrent: true, description: 'Engineer at Example Co, my own words' });
    expect(parseSharedCvDocument(document).ok).toBe(true);
  });

  it('converts letter HTML and text with V1’s own paragraph rule', () => {
    const html = '<p>Dear Ms Example,</p><p>I build &amp; test.<br>Line two.</p><ul><li>One</li></ul>';
    expect(letterHtmlToText(html)).toBe('Dear Ms Example,\n\nI build & test.\nLine two.\n\n- One');
    expect(letterTextToHtml('Dear Ms Example,\n\nI build & test.\nLine two.')).toBe('<p>Dear Ms Example,</p><p>I build &amp; test.<br>Line two.</p>');
    expect(letterHtmlToText(letterTextToHtml('A <b> tag stays text'))).toBe('A <b> tag stays text');
  });
});
