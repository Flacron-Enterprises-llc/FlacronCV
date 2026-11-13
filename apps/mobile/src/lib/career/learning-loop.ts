import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { LearningLoopView } from '../../../../../packages/career-api-client/src/types';
import { t } from '../../i18n';
import { careerErrorMessage } from '../career-view';

/**
 * Pure view logic for the mobile "Application outcomes" screen (tested in
 * learning-loop.test.ts). Matches the website's career/learning-loop page:
 * the server's statement (which carries the sample caveat) and optional
 * suggestion, plus the counts it was built from. These are observed counts in
 * the user's own recorded applications, never a hiring probability.
 */

export function loopTitle(): string {
  return t('career.areas.outcomes.title');
}

export function loopIntro(): string {
  return t('career.outcomes.intro');
}

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
    { key: 'recorded', label: t('career.outcomes.stats.recorded'), value: String(report.recordedApplications) },
    { key: 'interviews', label: t('career.outcomes.stats.interviews'), value: String(report.interviews) },
    { key: 'offers', label: t('career.outcomes.stats.offers'), value: String(report.offers) },
    { key: 'noResponse', label: t('career.outcomes.stats.noResponse'), value: String(report.noResponse) },
    { key: 'unrecorded', label: t('career.outcomes.stats.unrecorded'), value: String(report.unrecorded) },
  ];
  if (report.interviewRatePercent !== null) {
    stats.splice(1, 0, { key: 'rate', label: t('career.outcomes.stats.rate'), value: `${report.interviewRatePercent}%` });
  }
  const empty = report.sampleSize === 0;
  let sampleNote: string | null = null;
  if (empty) {
    sampleNote = t('career.outcomes.sample.empty');
  } else if (report.recordedApplications === 0) {
    sampleNote = t('career.outcomes.sample.none');
  } else if (report.recordedApplications < SMALL_SAMPLE) {
    sampleNote = t('career.outcomes.sample.small', { count: report.recordedApplications });
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
  return careerErrorMessage(error, t('career.outcomes.loadFailed'));
}
