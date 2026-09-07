import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useAuthStore } from '../store/auth-store';

export const REMINDERS_CHANNEL = 'reminders';
export const JOB_REMINDER_STORAGE_KEY = 'flacroncv_job_reminder_ids';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export type ReminderEntry = { id: string; at: string };
export type JobReminderSlots = {
  followUp?: ReminderEntry;
  interview?: ReminderEntry;
};
export type JobReminderMap = Record<string, JobReminderSlots>;

export type ReminderJob = {
  id: string;
  position: string;
  company: string;
  followUpDate?: string | null;
  interviewDate?: string | null;
};

type SyncOpts = {
  /** Skip the preferences flag (OS permission is still required). */
  skipPreferenceCheck?: boolean;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function localDate(y: number, m: number, d: number, hh: number, mm: number): Date {
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** Parse YYYY-MM-DD from components. Never `new Date("YYYY-MM-DD")`. */
export function parseDateOnlyParts(value: unknown): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string') return null;
  const sliced = value.length >= 10 ? value.slice(0, 10) : value;
  const match = DATE_ONLY.exec(sliced);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = localDate(y, m, d, 0, 0);
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** Parse YYYY-MM-DDTHH:mm from components. */
export function parseDateTimeParts(
  value: unknown,
): { y: number; m: number; d: number; hh: number; mm: number } | null {
  if (typeof value !== 'string') return null;
  const sliced = value.length >= 16 ? value.slice(0, 16) : value;
  const match = DATE_TIME.exec(sliced);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const hh = Number(match[4]);
  const mm = Number(match[5]);
  if (hh > 23 || mm > 59) return null;
  const probe = localDate(y, m, d, hh, mm);
  if (
    probe.getFullYear() !== y ||
    probe.getMonth() !== m - 1 ||
    probe.getDate() !== d ||
    probe.getHours() !== hh ||
    probe.getMinutes() !== mm
  ) {
    return null;
  }
  return { y, m, d, hh, mm };
}

function isPast(trigger: Date, now: Date): boolean {
  return trigger.getTime() <= now.getTime();
}

export function followUpTriggerAt(value: unknown, now: Date): Date | null {
  const parts = parseDateOnlyParts(value);
  if (!parts) return null;
  const trigger = localDate(parts.y, parts.m, parts.d, 9, 0);
  return isPast(trigger, now) ? null : trigger;
}

/**
 * 09:00 that day, unless the interview clock is before 10:00 — then 60 minutes
 * before the interview.
 */
export function interviewTriggerAt(value: unknown, now: Date): Date | null {
  const parts = parseDateTimeParts(value);
  if (!parts) return null;
  const minutes = parts.hh * 60 + parts.mm;
  const interviewAt = localDate(parts.y, parts.m, parts.d, parts.hh, parts.mm);
  const trigger =
    minutes < 10 * 60
      ? new Date(interviewAt.getTime() - 60 * 60 * 1000)
      : localDate(parts.y, parts.m, parts.d, 9, 0);
  return isPast(trigger, now) ? null : trigger;
}

function withCompany(base: string, company: string): string {
  const trimmed = company.trim();
  return trimmed ? `${base} with ${trimmed}` : base;
}

export function followUpReminderBody(company: string): string {
  return withCompany('Follow-up today', company);
}

export function interviewReminderBody(company: string, hh: number, mm: number): string {
  return withCompany(`Interview today at ${pad(hh)}:${pad(mm)}`, company);
}

async function loadMap(): Promise<JobReminderMap> {
  try {
    const raw = await AsyncStorage.getItem(JOB_REMINDER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as JobReminderMap;
  } catch {
    return {};
  }
}

async function saveMap(map: JobReminderMap): Promise<void> {
  await AsyncStorage.setItem(JOB_REMINDER_STORAGE_KEY, JSON.stringify(map));
}

export async function ensureRemindersChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function permissionGranted(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

async function canSchedule(opts?: SyncOpts): Promise<boolean> {
  if (!(await permissionGranted())) return false;
  if (opts?.skipPreferenceCheck) return true;
  return useAuthStore.getState().user?.preferences?.pushNotifications === true;
}

async function cancelIdentifier(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // Already gone or native no-op.
  }
}

async function scheduleOnce(
  job: ReminderJob,
  trigger: Date,
  body: string,
): Promise<string> {
  await ensureRemindersChannel();
  return Notifications.scheduleNotificationAsync({
    content: {
      title: job.position.trim() || 'Job',
      body,
      data: { jobId: job.id },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: trigger,
      channelId: REMINDERS_CHANNEL,
    },
  });
}

async function upsertSlot(
  job: ReminderJob,
  kind: keyof JobReminderSlots,
  trigger: Date | null,
  body: string,
): Promise<void> {
  const map = await loadMap();
  const current = map[job.id]?.[kind];
  if (!trigger) {
    if (current?.id) await cancelIdentifier(current.id);
    if (map[job.id]) {
      delete map[job.id][kind];
      if (!map[job.id].followUp && !map[job.id].interview) delete map[job.id];
      await saveMap(map);
    }
    return;
  }
  const at = trigger.toISOString();
  if (current?.id && current.at === at) return;
  if (current?.id) await cancelIdentifier(current.id);
  const id = await scheduleOnce(job, trigger, body);
  const slots = map[job.id] ?? {};
  slots[kind] = { id, at };
  map[job.id] = slots;
  await saveMap(map);
}

export async function syncJobReminder(job: ReminderJob, opts?: SyncOpts): Promise<void> {
  try {
    if (!(await canSchedule(opts))) return;
    const now = new Date();
    await upsertSlot(job, 'followUp', followUpTriggerAt(job.followUpDate, now), followUpReminderBody(job.company));
    const interviewParts = parseDateTimeParts(job.interviewDate);
    const interviewBody = interviewParts
      ? interviewReminderBody(job.company, interviewParts.hh, interviewParts.mm)
      : '';
    await upsertSlot(
      job,
      'interview',
      interviewTriggerAt(job.interviewDate, now),
      interviewBody,
    );
  } catch {
    // Never block save / list fetch.
  }
}

export async function cancelJobReminders(jobId: string): Promise<void> {
  try {
    const map = await loadMap();
    const slots = map[jobId];
    if (!slots) return;
    if (slots.followUp?.id) await cancelIdentifier(slots.followUp.id);
    if (slots.interview?.id) await cancelIdentifier(slots.interview.id);
    delete map[jobId];
    await saveMap(map);
  } catch {
    // ignore
  }
}

export async function cancelAllJobReminders(): Promise<void> {
  try {
    const map = await loadMap();
    for (const slots of Object.values(map)) {
      if (slots.followUp?.id) await cancelIdentifier(slots.followUp.id);
      if (slots.interview?.id) await cancelIdentifier(slots.interview.id);
    }
    await saveMap({});
  } catch {
    // ignore
  }
}

export async function reconcileJobReminders(jobs: ReminderJob[]): Promise<void> {
  try {
    if (!(await canSchedule())) return;
    const living = new Set(jobs.map((j) => j.id));
    for (const job of jobs) {
      await syncJobReminder(job, { skipPreferenceCheck: true });
    }
    const map = await loadMap();
    for (const jobId of Object.keys(map)) {
      if (!living.has(jobId)) await cancelJobReminders(jobId);
    }
  } catch {
    // ignore
  }
}

export function jobIdFromNotificationResponse(
  response: Notifications.NotificationResponse | null | undefined,
): string | null {
  const data = response?.notification.request.content.data;
  if (!data || typeof data !== 'object') return null;
  const jobId = (data as { jobId?: unknown }).jobId;
  return typeof jobId === 'string' && jobId.trim() ? jobId.trim() : null;
}

export function jobHref(jobId: string): `/(dashboard)/jobs/${string}` {
  return `/(dashboard)/jobs/${jobId}`;
}
