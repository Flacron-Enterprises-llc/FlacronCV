import { describe, expect, it } from 'vitest';
import {
  buildLinkedInRequest,
  LINKEDIN_CV_CONTENT_MAX,
  LINKEDIN_TARGET_ROLE_MAX,
  linkedInShareText,
  parseLinkedIn,
  skillsCopyText,
} from './linkedin';

describe('buildLinkedInRequest (LinkedinOptimizeDto)', () => {
  it('omits a blank role and trims content', () => {
    expect(buildLinkedInRequest('  Ada Lovelace\nEngineer  ', '   ')).toEqual({ cvContent: 'Ada Lovelace\nEngineer' });
  });

  it('sends a trimmed role and only the DTO keys', () => {
    const body = buildLinkedInRequest('CV', ' Product Manager ');
    expect(body).toEqual({ cvContent: 'CV', targetRole: 'Product Manager' });
    expect(Object.keys(body).sort()).toEqual(['cvContent', 'targetRole']);
  });

  it('clamps to the DTO max lengths', () => {
    const body = buildLinkedInRequest('x'.repeat(LINKEDIN_CV_CONTENT_MAX + 10), 'r'.repeat(LINKEDIN_TARGET_ROLE_MAX + 5));
    expect(body.cvContent).toHaveLength(LINKEDIN_CV_CONTENT_MAX);
    expect(body.targetRole).toHaveLength(LINKEDIN_TARGET_ROLE_MAX);
  });
});

describe('parseLinkedIn (AIResponse.content)', () => {
  it('parses a fenced JSON object', () => {
    const raw = 'Here you go:\n```json\n{"headline":"PM | Growth","about":"I build.","skills":["SQL",2,""],"tips":["Add a banner"]}\n```';
    expect(parseLinkedIn(raw)).toEqual({
      headline: 'PM | Growth',
      about: 'I build.',
      skills: ['SQL', '2'],
      tips: ['Add a banner'],
    });
  });

  it('tolerates missing fields and wrong types', () => {
    expect(parseLinkedIn('{"headline":"Only headline","skills":"nope","tips":null}')).toEqual({
      headline: 'Only headline',
      about: '',
      skills: [],
      tips: [],
    });
  });

  it('returns null for unreadable or empty results', () => {
    expect(parseLinkedIn('')).toBeNull();
    expect(parseLinkedIn('not json')).toBeNull();
    expect(parseLinkedIn('{"tips":["only tips"]}')).toBeNull();
  });
});

describe('copy / share text', () => {
  const result = { headline: 'H', about: 'A', skills: ['SQL', 'Go'], tips: ['T1', 'T2'] };
  it('copies skills comma-separated like the website', () => {
    expect(skillsCopyText(result)).toBe('SQL, Go');
  });
  it('builds a labelled share text and skips empty parts', () => {
    expect(linkedInShareText(result)).toBe(
      'Headline\nH\n\nAbout section\nA\n\nSkills & keywords\nSQL, Go\n\nTips\n- T1\n- T2',
    );
    expect(linkedInShareText({ headline: 'H', about: '', skills: [], tips: [] })).toBe('Headline\nH');
  });
});
