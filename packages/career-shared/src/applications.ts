export const APPLICATION_STATUSES = [
  'saved',
  'preparing',
  'applied',
  'interviewing',
  'offered',
  'rejected',
  'withdrawn',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface ChecklistItem {
  label: string;
  done: boolean;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isApplicationStatus(value: string): value is ApplicationStatus {
  return (APPLICATION_STATUSES as readonly string[]).includes(value);
}

/** A real calendar day, years 1900 to 2100. Applications do not keep a partial date. */
export function isDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** One event per reminder, plus the listing deadline when it is a full date. No score and no hire chance. */
export function applicationCalendar(input: {
  applicationId: string;
  title: string;
  deadline: string | null;
  reminders: Array<{ id: string; remindAt: string }>;
}): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//FlacronCV//Applications//EN'];
  if (input.deadline && isDateOnly(input.deadline)) {
    lines.push(...eventLines(`${input.applicationId}-deadline`, `${input.deadline.replace(/-/g, '')}T090000Z`, input.title));
  }
  for (const reminder of input.reminders) {
    const stamp = stampOf(reminder.remindAt);
    if (stamp) lines.push(...eventLines(reminder.id, stamp, input.title));
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function eventLines(uid: string, start: string, title: string): string[] {
  return ['BEGIN:VEVENT', `UID:${uid}@flacroncv`, `DTSTAMP:${start}`, `DTSTART:${start}`, `SUMMARY:${escapeText(title)}`, 'END:VEVENT'];
}

function stampOf(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
