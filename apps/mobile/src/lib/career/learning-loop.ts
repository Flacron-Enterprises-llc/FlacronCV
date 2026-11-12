import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { LearningLoopView } from '../../../../../packages/career-api-client/src/types';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for the mobile "Application outcomes" screen (tested in
 * learning-loop.test.ts). Matches the website's career/learning-loop page:
 * the server's statement (which carries the sample caveat) and optional
 * suggestion, plus the counts it was built from. These are observed counts in
 * the user's own recorded applications, never a hiring probability.
 */

export const LOOP_TITLE = 'Application outcomes';
export const LOOP_INTRO = 'Observed rates in your recorded applications. Not a hiring probability.';

export interface LoopStat {
  key: string;
  label: string;
  value: string;
}

export interface LoopViewModel {
  statement: string;
  suggestion: string | null;
  stats: LoopStat[];
  /** Extra caveat when the sample is empty or small enough that one result moves the rate a lot. */
  sampleNote: string | null;
  empty: boolean;
}

/** Below this many recorded applications, one more outcome changes the rate by 10 points or more. */
export const SMALL_SAMPLE = 10;

export function loopViewModel(report: LearningLoopView): LoopViewModel {
  const stats: LoopStat[] = [
    { key: 'recorded', label: 'Recorded applications', value: String(report.recordedApplications) },
    { key: 'interviews', label: 'Interviews', value: String(report.interviews) },
    { key: 'offers', label: 'Offers', value: String(report.offers) },
    { key: 'noResponse', label: 'Applied, no response yet', value: String(report.noResponse) },
    { key: 'unrecorded', label: 'Saved or preparing (not counted)', value: String(report.unrecorded) },
  ];
  if (report.interviewRatePercent !== null) {
    stats.splice(1, 0, { key: 'rate', label: 'Observed interview rate in this sample', value: `${report.interviewRatePercent}%` });
  }
  const empty = report.sampleSize === 0;
  let sampleNote: string | null = null;
  if (empty) {
    sampleNote = 'No applications yet. Counts come from the applications in your Job Tracker.';
  } else if (report.recordedApplications === 0) {
    sampleNote = 'None of your applications has a recorded outcome yet, so there is no rate to show.';
  } else if (report.recordedApplications < SMALL_SAMPLE) {
    sampleNote = `This is a small sample (${report.recordedApplications} recorded). One more outcome can change the rate a lot.`;
  }
  return { statement: report.statement, suggestion: report.suggestion, stats, sampleNote, empty };
}

export function loopErrorKind(error: unknown): 'switched-off' | 'not-included' | 'other' {
  if (error instanceof ApiError) {
    if (error.code === 'feature_unavailable') return 'switched-off';
    if (error.code === 'plan_upgrade_required') return 'not-included';
  }
  return 'other';
}

export function loopErrorMessage(error: unknown): string {
  return careerErrorMessage(error, 'This page could not be loaded. Nothing was changed. Try again.');
}
