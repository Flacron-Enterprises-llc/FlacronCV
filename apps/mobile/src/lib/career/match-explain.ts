import { ApiError } from '../../../../../packages/career-api-client/src/client';
import type { MatchResult } from '../../../../../packages/career-api-client/src/types';
import { matchLabel, type MatchLabel, type MatchLabelReason } from '../../../../../packages/career-shared/src/match';
import { hasKey, t } from '../../i18n';
import { planName } from './alert-centre';
import { arrangementLabel, categoryLabel, scheduleLabel, seniorityLabel } from './opportunity-search';

/**
 * The explainable comparison (website `MatchExplanation`): a strong / possible
 * / stretch label with its reasons, then qualification fit, preference fit and
 * unknowns as three separate lists. Never a number that reads like a hiring
 * chance. Copy: `careerOpportunities`.
 */

export interface MatchExplanationView {
  label: MatchLabel;
  labelText: string;
  fitText: string;
  reasons: string[];
  qualification: string[];
  preferences: string[];
  /** How many preferences are not set and therefore not compared; 0 hides the line. */
  notSetCount: number;
  unknowns: string[];
}

const key = (suffix: string, params?: Record<string, string | number>) => {
  const full = `careerOpportunities.${suffix}`;
  return hasKey(full) ? t(full, params) : suffix;
};

/** Coded listing values read in the interface language; places, pay and quoted limits stay as stated. */
export function preferenceDetail(dimension: string, detail: string | undefined): string {
  if (!detail) return '';
  if (dimension === 'arrangement') return arrangementLabel(detail);
  if (dimension === 'schedule') return detail === 'internship' ? categoryLabel('internship') : scheduleLabel(detail);
  if (dimension === 'seniority') return seniorityLabel(detail);
  if (dimension === 'location' && detail === 'remote') return arrangementLabel('remote');
  return detail;
}

export function explainMatch(match: MatchResult): MatchExplanationView {
  const derived = matchLabel(match.fit, match.gaps, match.preferenceFit ?? []);
  const label = match.label ?? derived.label;
  const reasons: MatchLabelReason[] = match.labelReasons ?? derived.labelReasons;
  const checks = match.preferenceFit ?? [];

  const qualification: string[] = [];
  // One line per matching word: the API returns one reason per matching fact.
  for (const token of new Set(match.reasons.filter((r) => r.code === 'confirmed_overlap').map((r) => r.token))) {
    qualification.push(key('reason_overlap', { token }));
  }
  for (const reason of match.reasons.filter((r) => r.code === 'credential_held')) {
    qualification.push(key('reason_credential', { token: reason.token }));
  }
  for (const gap of match.gaps) {
    qualification.push(gap.code === 'credential_missing' ? key('gap_credential', { token: gap.token }) : key('gap_word', { token: gap.token }));
  }

  const preferences = checks
    .filter((check) => check.status !== 'not_set')
    .map((check) => key(`pref_${check.dimension}_${check.status}`, { detail: preferenceDetail(check.dimension, check.detail) }));

  const unknowns = match.unknowns.map((unknown) =>
    unknown.code === 'unconfirmed' ? key('unknown_unconfirmed', { token: unknown.token ?? '' }) : key(`unknown_${unknown.code}`),
  );

  return {
    label,
    labelText: key(`label_${label}`),
    fitText: key(`fit_${match.fit}`),
    reasons: reasons.map((reason) => key(`label_reason_${reason}`)),
    qualification,
    preferences,
    notSetCount: checks.filter((check) => check.status === 'not_set').length,
    unknowns,
  };
}

/** Badge tone for the label (colour is never the only signal: the label text is always shown). */
export function labelTone(label: MatchLabel): 'success' | 'brand' | 'warning' | 'default' {
  if (label === 'strong_fit') return 'success';
  if (label === 'possible_fit') return 'brand';
  if (label === 'stretch') return 'warning';
  return 'default';
}

/**
 * Comparison refused by the plan: the website's upgrade state, naming the plan
 * comparisons start on when the server says so. Information only — the app
 * links to the plan comparison, never to a purchase (store rules).
 */
export function compareUpgradeText(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code !== 'plan_upgrade_required' && error.code !== 'feature_unavailable') return null;
  const minimum = typeof error.body?.minimumPlan === 'string' ? error.body.minimumPlan : null;
  return minimum ? key('compare_upgrade_body', { plan: planName(minimum) }) : key('compare_upgrade_body_generic');
}
