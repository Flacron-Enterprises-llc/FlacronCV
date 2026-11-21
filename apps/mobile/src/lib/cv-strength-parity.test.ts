import { describe, expect, it } from 'vitest';
import * as mobile from './cv-strength';
import * as web from '../../../web/src/lib/cv-strength';

// The app and the website must score a CV the same way.
const people = [
  null,
  { firstName: 'Ada', lastName: 'Lovelace', email: 'a@b.co', summary: 'short' },
  { firstName: 'Ada', lastName: 'L', email: 'a@b.co', phone: '1', city: 'X', headline: 'H', summary: 'y'.repeat(200), github: 'g' },
];
const sectionSets = [
  [],
  [{ type: 'experience', items: [{ position: 'P', company: 'C' }] }, { type: 'skills', items: [{ name: 'S' }] }],
  [{ type: 'experience', items: [{ position: 'P', company: 'C', highlights: ['h'] }] }, { type: 'education', items: [{ degree: 'D' }] }, { type: 'skills', items: ['1', '2', '3', '4', '5'].map((name) => ({ name })) }],
  [{ type: 'experience', isVisible: false, items: [{ position: 'P', company: 'C' }] }, { type: 'skills', items: [{ name: 'S', isSample: true }] }],
];

describe('cv-strength parity with the website', () => {
  it('scores every combination identically', () => {
    for (const person of people) for (const sections of sectionSets) {
      expect(mobile.cvStrength(person, sections, 'short')).toEqual(web.cvStrength(person, sections, 'short'));
      expect(mobile.cvStrength(person, sections)).toEqual(web.cvStrength(person, sections));
    }
  });
});
