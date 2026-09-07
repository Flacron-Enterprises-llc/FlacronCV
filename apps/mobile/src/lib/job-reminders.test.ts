/* eslint-disable import/first -- vi.mock factories must run before the module under test */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = new Map<string, string>();
const scheduled: {
  id: string;
  date: Date;
  title: string;
  body: string;
  jobId: string;
  channelId?: string;
  type?: string;
}[] = [];
let nextId = 1;
let permission: 'granted' | 'denied' = 'granted';
let pushOn = true;

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: async (key: string) => {
      storage.delete(key);
    },
  },
}));

vi.mock('../store/auth-store', () => ({
  useAuthStore: {
    getState: () => ({
      user: { preferences: { pushNotifications: pushOn } },
    }),
  },
}));

vi.mock('expo-notifications', () => {
  const DATE = 'date';
  return {
    SchedulableTriggerInputTypes: { DATE },
    AndroidImportance: { DEFAULT: 3 },
    getPermissionsAsync: async () => ({ status: permission }),
    setNotificationChannelAsync: async () => undefined,
    cancelScheduledNotificationAsync: async (id: string) => {
      const idx = scheduled.findIndex((s) => s.id === id);
      if (idx >= 0) scheduled.splice(idx, 1);
    },
    scheduleNotificationAsync: async (input: {
      content: { title: string; body: string; data?: { jobId?: string } };
      trigger: { type?: string; date: Date; channelId?: string };
    }) => {
      const id = `notif-${nextId}`;
      nextId += 1;
      scheduled.push({
        id,
        date: input.trigger.date,
        title: input.content.title,
        body: input.content.body,
        jobId: input.content.data?.jobId ?? '',
        channelId: input.trigger.channelId,
        type: input.trigger.type,
      });
      return id;
    },
  };
});

import {
  JOB_REMINDER_STORAGE_KEY,
  REMINDERS_CHANNEL,
  cancelAllJobReminders,
  cancelJobReminders,
  followUpReminderBody,
  followUpTriggerAt,
  interviewReminderBody,
  interviewTriggerAt,
  jobHref,
  jobIdFromNotificationResponse,
  parseDateOnlyParts,
  reconcileJobReminders,
  syncJobReminder,
} from './job-reminders';

function job(partial: {
  id: string;
  followUpDate?: string | null;
  interviewDate?: string | null;
  company?: string;
  position?: string;
}) {
  return {
    id: partial.id,
    position: partial.position ?? 'Product designer',
    company: partial.company ?? 'Acme',
    followUpDate: partial.followUpDate ?? null,
    interviewDate: partial.interviewDate ?? null,
  };
}

async function mapOf() {
  const raw = storage.get(JOB_REMINDER_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, { followUp?: { id: string; at: string }; interview?: { id: string; at: string } }>) : {};
}

describe('job reminder date parsing', () => {
  it('builds follow-up 09:00 from Y/M/D components, not UTC midnight', () => {
    const now = new Date(2026, 0, 1, 12, 0, 0);
    const parts = parseDateOnlyParts('2026-09-20');
    expect(parts).toEqual({ y: 2026, m: 9, d: 20 });

    const trigger = followUpTriggerAt('2026-09-20', now);
    expect(trigger).not.toBeNull();
    expect(trigger!.getFullYear()).toBe(2026);
    expect(trigger!.getMonth()).toBe(8);
    expect(trigger!.getDate()).toBe(20);
    expect(trigger!.getHours()).toBe(9);
    expect(trigger!.getMinutes()).toBe(0);

    // `new Date("YYYY-MM-DD")` is UTC midnight — wrong local day west of UTC.
    const utcMidnight = new Date('2026-09-20');
    expect(utcMidnight.getUTCHours()).toBe(0);
    expect(utcMidnight.getUTCDate()).toBe(20);
    expect(trigger!.getTime()).not.toBe(utcMidnight.getTime());
    if (utcMidnight.getTimezoneOffset() > 0) {
      expect(utcMidnight.getDate()).not.toBe(20);
    }
  });

  it('fires interview at 09:00 when the interview is 10:00 or later', () => {
    const now = new Date(2026, 0, 1, 12, 0, 0);
    const trigger = interviewTriggerAt('2026-12-01T14:30', now)!;
    expect(trigger.getHours()).toBe(9);
    expect(trigger.getMinutes()).toBe(0);
    expect(trigger.getDate()).toBe(1);
  });

  it('fires 60 minutes before an interview that starts before 10:00', () => {
    const now = new Date(2026, 0, 1, 12, 0, 0);
    const trigger = interviewTriggerAt('2026-12-01T09:30', now)!;
    expect(trigger.getHours()).toBe(8);
    expect(trigger.getMinutes()).toBe(30);
  });

  it('treats 10:00 as the 09:00-that-day path, not 60 minutes before', () => {
    const now = new Date(2026, 0, 1, 12, 0, 0);
    const trigger = interviewTriggerAt('2026-12-01T10:00', now)!;
    expect(trigger.getHours()).toBe(9);
    expect(trigger.getMinutes()).toBe(0);
  });

  it('returns null when the chosen moment is already past', () => {
    const noon = new Date(2026, 8, 20, 12, 0, 0);
    expect(followUpTriggerAt('2026-09-20', noon)).toBeNull();
    expect(interviewTriggerAt('2026-09-20T14:30', noon)).toBeNull();
  });
});

describe('reminder copy', () => {
  it('drops with {company} when company is empty', () => {
    expect(followUpReminderBody('')).toBe('Follow-up today');
    expect(followUpReminderBody('  ')).toBe('Follow-up today');
    expect(interviewReminderBody('', 14, 30)).toBe('Interview today at 14:30');
  });

  it('includes company when present', () => {
    expect(followUpReminderBody('Acme')).toBe('Follow-up today with Acme');
    expect(interviewReminderBody('Acme', 9, 5)).toBe('Interview today at 09:05 with Acme');
  });
});

describe('syncJobReminder', () => {
  beforeEach(() => {
    storage.clear();
    scheduled.length = 0;
    nextId = 1;
    permission = 'granted';
    pushOn = true;
  });

  it('schedules on save for a future follow-up', async () => {
    await syncJobReminder(job({ id: 'j1', followUpDate: '2026-09-20' }), {
      skipPreferenceCheck: true,
    });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].title).toBe('Product designer');
    expect(scheduled[0].body).toBe('Follow-up today with Acme');
    expect(scheduled[0].jobId).toBe('j1');
    expect(scheduled[0].type).toBe('date');
    expect(scheduled[0].channelId).toBe(REMINDERS_CHANNEL);
    const stored = await mapOf();
    expect(stored.j1.followUp?.id).toBe('notif-1');
    expect(stored.j1.followUp?.at).toBe(scheduled[0].date.toISOString());
  });

  it('schedules an interview with clock time in the body', async () => {
    await syncJobReminder(job({ id: 'j1', interviewDate: '2026-12-01T14:30' }), {
      skipPreferenceCheck: true,
    });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].body).toBe('Interview today at 14:30 with Acme');
    expect(scheduled[0].date.getHours()).toBe(9);
    expect(scheduled[0].date.getMinutes()).toBe(0);
  });

  it('reschedules on date change and cancels the old id', async () => {
    await syncJobReminder(job({ id: 'j1', followUpDate: '2026-09-20' }), {
      skipPreferenceCheck: true,
    });
    const firstId = scheduled[0].id;
    await syncJobReminder(job({ id: 'j1', followUpDate: '2026-09-21' }), {
      skipPreferenceCheck: true,
    });
    expect(scheduled.find((s) => s.id === firstId)).toBeUndefined();
    expect(scheduled).toHaveLength(1);
    const stored = await mapOf();
    expect(stored.j1.followUp?.id).toBe('notif-2');
    expect(stored.j1.followUp?.at).not.toBeUndefined();
  });

  it('cancels on delete', async () => {
    await syncJobReminder(job({ id: 'j1', followUpDate: '2026-09-20' }), {
      skipPreferenceCheck: true,
    });
    await cancelJobReminders('j1');
    expect(scheduled).toHaveLength(0);
    expect(await mapOf()).toEqual({});
  });

  it('cancel-all on toggle off', async () => {
    await syncJobReminder(job({ id: 'j1', followUpDate: '2026-09-20' }), {
      skipPreferenceCheck: true,
    });
    await syncJobReminder(job({ id: 'j2', followUpDate: '2026-09-22' }), {
      skipPreferenceCheck: true,
    });
    await cancelAllJobReminders();
    expect(scheduled).toHaveLength(0);
    expect(await mapOf()).toEqual({});
  });

  it('does not schedule when the date is past', async () => {
    const past = '2020-01-01';
    await syncJobReminder(job({ id: 'j1', followUpDate: past }), { skipPreferenceCheck: true });
    expect(scheduled).toHaveLength(0);
  });

  it('does not schedule when permission is denied', async () => {
    permission = 'denied';
    await syncJobReminder(job({ id: 'j1', followUpDate: '2026-09-20' }));
    expect(scheduled).toHaveLength(0);
  });

  it('does not schedule when the preference is off', async () => {
    pushOn = false;
    await syncJobReminder(job({ id: 'j1', followUpDate: '2026-09-20' }));
    expect(scheduled).toHaveLength(0);
  });

  it('leaves a matching entry alone on a second sync', async () => {
    await syncJobReminder(job({ id: 'j1', followUpDate: '2026-09-20' }), {
      skipPreferenceCheck: true,
    });
    expect(scheduled).toHaveLength(1);
    await syncJobReminder(job({ id: 'j1', followUpDate: '2026-09-20' }), {
      skipPreferenceCheck: true,
    });
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].id).toBe('notif-1');
  });
});

describe('reconcileJobReminders', () => {
  beforeEach(() => {
    storage.clear();
    scheduled.length = 0;
    nextId = 1;
    permission = 'granted';
    pushOn = true;
  });

  it('schedules a new job', async () => {
    await syncJobReminder(job({ id: 'keep', followUpDate: '2026-09-20' }));
    await reconcileJobReminders([
      job({ id: 'keep', followUpDate: '2026-09-20' }),
      job({ id: 'new', followUpDate: '2026-09-28' }),
    ]);
    const stored = await mapOf();
    expect(stored.new.followUp).toBeTruthy();
    expect(scheduled.some((s) => s.jobId === 'new')).toBe(true);
  });

  it('cancels a removed job', async () => {
    await syncJobReminder(job({ id: 'keep', followUpDate: '2026-09-20' }));
    await syncJobReminder(job({ id: 'gone', followUpDate: '2026-09-22' }));
    const goneId = (await mapOf()).gone.followUp!.id;
    await reconcileJobReminders([job({ id: 'keep', followUpDate: '2026-09-20' })]);
    expect((await mapOf()).gone).toBeUndefined();
    expect(scheduled.find((s) => s.id === goneId)).toBeUndefined();
  });

  it('reschedules when the date changed', async () => {
    await syncJobReminder(job({ id: 'moved', followUpDate: '2026-09-24' }));
    const movedOld = (await mapOf()).moved.followUp!.id;
    await reconcileJobReminders([job({ id: 'moved', followUpDate: '2026-09-25' })]);
    expect((await mapOf()).moved.followUp!.id).not.toBe(movedOld);
  });

  it('leaves an unchanged entry alone', async () => {
    await syncJobReminder(job({ id: 'keep', followUpDate: '2026-09-20' }));
    const keepId = (await mapOf()).keep.followUp!.id;
    await reconcileJobReminders([job({ id: 'keep', followUpDate: '2026-09-20' })]);
    expect((await mapOf()).keep.followUp!.id).toBe(keepId);
    expect(scheduled).toHaveLength(1);
  });
});

describe('notification tap routing', () => {
  it('reads jobId and builds the edit href', () => {
    expect(jobHref('abc')).toBe('/(dashboard)/jobs/abc');
    const response = {
      notification: {
        request: {
          identifier: 'n1',
          content: { data: { jobId: 'abc' } },
        },
      },
    };
    expect(jobIdFromNotificationResponse(response as never)).toBe('abc');
    expect(jobIdFromNotificationResponse(null)).toBeNull();
  });
});
