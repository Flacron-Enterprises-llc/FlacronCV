import { describe, expect, it } from 'vitest';
import type { ReminderList } from '../../../../../packages/career-api-client/src/types';
import { achievementNeedsNumber } from './facts-assist';
import { formatIssueLines } from './readability';
import { markedRead, reminderLine, reminderRoute } from './reminders';

describe('reminders', () => {
  it('always says what the date is', () => {
    expect(reminderLine({ kind: 'listing_deadline', dueDate: '2026-12-01' }, 'en-US')).toBe('Listing deadline Dec 1, 2026');
    expect(reminderLine({ kind: 'application_follow_up', dueDate: '2026-12-01' }, 'en-US')).not.toMatch(/deadline/i);
  });

  it('maps website links to app screens and nothing else', () => {
    expect(reminderRoute('/jobs')).toBe('/(dashboard)/jobs');
    expect(reminderRoute('/career/opportunities/o1?x=1')).toBe('/(dashboard)/career/opportunities/o1');
    expect(reminderRoute('/career/maintenance')).toBe('/(dashboard)/career/maintenance');
    expect(reminderRoute('/settings/billing')).toBeNull();
    expect(reminderRoute('https://example.com')).toBeNull();
    expect(reminderRoute(null)).toBeNull();
  });

  it('marks one read and lowers the count once', () => {
    const list: ReminderList = {
      unread: 1,
      history: [],
      upcoming: [
        { id: 'r1', kind: 'interview', title: 'A', dueDate: '2026-12-01', link: null, read: false, createdAt: '', deliveries: [] },
        { id: 'r2', kind: 'interview', title: 'B', dueDate: '2026-12-02', link: null, read: true, createdAt: '', deliveries: [] },
      ],
    };
    const once = markedRead(list, 'r1');
    expect(once.unread).toBe(0);
    expect(once.upcoming[0].read).toBe(true);
    expect(markedRead(once, 'r1').unread).toBe(0);
  });
});

describe('profile helpers', () => {
  it('asks for a number only when the achievement has none and no metric', () => {
    expect(achievementNeedsNumber('Made the monthly report faster', '')).toBe(true);
    expect(achievementNeedsNumber('Cut the report from 3 days to 1', '')).toBe(false);
    expect(achievementNeedsNumber('Made the report faster', '40% faster')).toBe(false);
    expect(achievementNeedsNumber('', '')).toBe(false);
  });

  it('lists known format checks and skips codes without copy', () => {
    const lines = formatIssueLines([{ code: 'long_line', factId: 'f1' }, { code: 'brand_new_check' }, { code: 'missing_contact', section: 'contact' }]);
    expect(lines.map((line) => line.key)).toEqual(['long_line-f1', 'missing_contact-contact']);
    expect(lines[1].text).toBe('No email or phone number in the contact section.');
    expect(formatIssueLines(undefined)).toEqual([]);
  });
});
