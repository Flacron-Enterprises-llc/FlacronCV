import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildIcsEvent, downloadIcs, escapeIcsText, foldIcsLine } from './ics';

/** Every content line of the file, with the trailing CRLF dropped. */
function lines(ics: string): string[] {
  return ics.replace(/\r\n$/, '').split('\r\n');
}

/** Reverse RFC 5545 folding, so a folded value can be compared to its source. */
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, '');
}

/** The value of a property, after unfolding. */
function prop(ics: string, name: string): string | undefined {
  const line = lines(unfold(ics)).find((l) => l.startsWith(`${name}:`));
  return line?.slice(name.length + 1);
}

const octets = (s: string) => new TextEncoder().encode(s).length;

const BASE = {
  title: 'Interview: Senior Engineer at Acme',
  start: '2026-08-03T14:30:00.000Z',
  now: new Date('2026-07-30T09:00:00.000Z'),
};

describe('buildIcsEvent', () => {
  describe('calendar structure', () => {
    it('wraps a single VEVENT in a VERSION 2.0 VCALENDAR', () => {
      const l = lines(buildIcsEvent(BASE)!);
      expect(l[0]).toBe('BEGIN:VCALENDAR');
      expect(l).toContain('VERSION:2.0');
      expect(l.at(-1)).toBe('END:VCALENDAR');
      expect(l.filter((x) => x === 'BEGIN:VEVENT')).toHaveLength(1);
      expect(l.indexOf('BEGIN:VEVENT')).toBeLessThan(l.indexOf('END:VEVENT'));
    });

    it('carries a PRODID and a DTSTAMP', () => {
      const ics = buildIcsEvent(BASE)!;
      expect(prop(ics, 'PRODID')).toContain('FlacronCV');
      expect(prop(ics, 'DTSTAMP')).toBe('20260730T090000Z');
    });

    it('emits the optional properties only when they have content', () => {
      const bare = buildIcsEvent(BASE)!;
      expect(bare).not.toContain('DESCRIPTION:');
      expect(bare).not.toContain('LOCATION:');
      expect(bare).not.toContain('URL:');

      const full = buildIcsEvent({
        ...BASE,
        description: 'Panel round',
        location: 'Remote',
        url: 'https://jobs.example.com/123',
      })!;
      expect(prop(full, 'DESCRIPTION')).toBe('Panel round');
      expect(prop(full, 'LOCATION')).toBe('Remote');
      expect(prop(full, 'URL')).toBe('https://jobs.example.com/123');
    });
  });

  describe('CRLF line endings', () => {
    it('separates every line with CRLF and never a bare LF', () => {
      const ics = buildIcsEvent({ ...BASE, description: 'Line one\nLine two' })!;
      // A bare LF anywhere would make strict parsers (Outlook) reject the file.
      // The escaped "\n" inside DESCRIPTION is a literal backslash + n, not a break.
      expect(/(^|[^\r])\n/.test(ics)).toBe(false);
      expect(ics.split('\r\n').length).toBeGreaterThan(10);
    });

    it('terminates the final line', () => {
      expect(buildIcsEvent(BASE)!.endsWith('END:VCALENDAR\r\n')).toBe(true);
    });
  });

  describe('escaping of special characters', () => {
    it('escapes commas, semicolons and backslashes in TEXT values', () => {
      // "Acme, Inc." is the classic break: an unescaped comma is a value
      // separator, so the summary silently truncates at "Interview".
      const ics = buildIcsEvent({
        ...BASE,
        title: 'Interview, round 2; final',
        location: 'C:\\Offices\\HQ, Floor 3',
      })!;
      expect(prop(ics, 'SUMMARY')).toBe('Interview\\, round 2\\; final');
      expect(prop(ics, 'LOCATION')).toBe('C:\\\\Offices\\\\HQ\\, Floor 3');
    });

    it('escapes newlines as a literal \\n rather than breaking the line', () => {
      const ics = buildIcsEvent({ ...BASE, description: 'First\nSecond\r\nThird\rFourth' })!;
      expect(prop(ics, 'DESCRIPTION')).toBe('First\\nSecond\\nThird\\nFourth');
    });

    it('escapes backslashes before the escapes it introduces (no double-escaping)', () => {
      // A user typing a literal "\n" must not come back as a real line break.
      expect(escapeIcsText('a\\nb')).toBe('a\\\\nb');
      expect(escapeIcsText('50\\50, split')).toBe('50\\\\50\\, split');
    });

    it('leaves URI values unescaped so query strings survive', () => {
      const url = 'https://jobs.example.com/apply?ref=a,b;c';
      expect(prop(buildIcsEvent({ ...BASE, url })!, 'URL')).toBe(url);
    });
  });

  describe('line folding', () => {
    it('keeps every line within 75 octets', () => {
      const ics = buildIcsEvent({
        ...BASE,
        description: 'A very long interview briefing '.repeat(12),
        location: 'Building 7, Level 4, The Long Named Business Park, Somewhereshire, UK',
      })!;
      for (const line of lines(ics)) expect(octets(line)).toBeLessThanOrEqual(75);
    });

    it('folds with CRLF + a single space, and unfolds to the original value', () => {
      const description = 'x'.repeat(200);
      const ics = buildIcsEvent({ ...BASE, description })!;
      expect(ics).toContain('\r\n ');
      expect(prop(ics, 'DESCRIPTION')).toBe(description);
    });

    it('leaves a line at exactly 75 octets alone', () => {
      const line = 'y'.repeat(75);
      expect(foldIcsLine(line)).toBe(line);
      expect(foldIcsLine('z'.repeat(76))).toContain('\r\n ');
    });

    it('folds on octets, not characters, without splitting a multi-byte char', () => {
      // 40 × 3-octet characters = 120 octets in only 40 JS characters: a
      // character-counting implementation would emit an over-long line here.
      const value = '日'.repeat(40);
      const folded = foldIcsLine(`DESCRIPTION:${value}`);
      for (const part of folded.split('\r\n')) expect(octets(part)).toBeLessThanOrEqual(75);
      expect(folded.replace(/\r\n /g, '')).toBe(`DESCRIPTION:${value}`);
      expect(folded).not.toContain('\uFFFD');
    });

    it('does not split a surrogate pair', () => {
      const folded = foldIcsLine(`SUMMARY:${'🎯'.repeat(30)}`);
      for (const part of folded.split('\r\n')) expect(octets(part)).toBeLessThanOrEqual(75);
      expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'🎯'.repeat(30)}`);
    });
  });

  describe('UTC timestamps', () => {
    it('converts an offset-bearing instant to Z', () => {
      const ics = buildIcsEvent({ ...BASE, start: '2026-08-03T14:30:00+02:00' })!;
      expect(prop(ics, 'DTSTART')).toBe('20260803T123000Z');
    });

    it('writes the basic-format stamp with no separators and no milliseconds', () => {
      expect(prop(buildIcsEvent(BASE)!, 'DTSTART')).toBe('20260803T143000Z');
    });

    it('keeps the instant of a datetime-local string from the form', () => {
      // interviewDate is a `datetime-local` value with no zone; it means local
      // wall-clock time, which must be converted to the matching UTC instant.
      const ics = buildIcsEvent({ ...BASE, start: '2026-08-03T14:30' })!;
      const expected = new Date('2026-08-03T14:30');
      expect(prop(ics, 'DTSTART')).toBe(
        expected.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''),
      );
    });

    it('defaults the event to one hour', () => {
      const ics = buildIcsEvent(BASE)!;
      expect(prop(ics, 'DTSTART')).toBe('20260803T143000Z');
      expect(prop(ics, 'DTEND')).toBe('20260803T153000Z');
    });

    it('honours an explicit end', () => {
      const ics = buildIcsEvent({ ...BASE, end: '2026-08-03T16:00:00.000Z' })!;
      expect(prop(ics, 'DTEND')).toBe('20260803T160000Z');
    });

    it('falls back to one hour when the end is not after the start', () => {
      const ics = buildIcsEvent({ ...BASE, end: '2026-08-03T09:00:00.000Z' })!;
      expect(prop(ics, 'DTEND')).toBe('20260803T153000Z');
    });
  });

  describe('UID', () => {
    it('is stable for the same event, so re-importing updates rather than duplicates', () => {
      const a = prop(buildIcsEvent(BASE)!, 'UID');
      const b = prop(buildIcsEvent({ ...BASE, now: new Date('2027-01-01T00:00:00.000Z') })!, 'UID');
      expect(a).toBe(b);
      expect(a).toMatch(/@/);
    });

    it('differs when the event does', () => {
      const a = prop(buildIcsEvent(BASE)!, 'UID');
      expect(prop(buildIcsEvent({ ...BASE, start: '2026-08-04T14:30:00.000Z' })!, 'UID')).not.toBe(a);
      expect(prop(buildIcsEvent({ ...BASE, title: 'Second interview' })!, 'UID')).not.toBe(a);
    });
  });

  describe('absent or unusable dates produce no event', () => {
    it.each([null, undefined, '', 'next Tuesday', {}, NaN])('start %p → null', (start) => {
      expect(buildIcsEvent({ ...BASE, start })).toBeNull();
    });
  });
});

describe('downloadIcs', () => {
  const createObjectURL = vi.fn(() => 'blob:mock-url');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    // jsdom implements neither, and the anchor click must not navigate.
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL;
  });

  it('clicks an anchor carrying a text/calendar blob, then cleans up', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadIcs('interview-acme.ics', buildIcsEvent(BASE)!);

    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('interview-acme.ics');
    expect(anchor.getAttribute('href')).toBe('blob:mock-url');
    expect((createObjectURL.mock.calls[0][0] as unknown as Blob).type).toBe(
      'text/calendar;charset=utf-8',
    );
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    // Nothing left attached to the document.
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('appends the extension and strips characters filesystems reject', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadIcs('interview/Acme: Q3', 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe('interview-Acme- Q3.ics');
  });
});
