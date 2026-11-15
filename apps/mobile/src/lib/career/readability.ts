import { FORMAT_ISSUE_CODES } from '../../../../../packages/career-shared/src/readability';
import { t } from '../../i18n';

/**
 * Format checks from `GET /resume-versions/:id/readability` (`formatIssues`;
 * website ResumeScreen). How the text may survive an applicant tracking
 * system, separate from job fit. A code this app has no copy for is skipped,
 * never shown raw. Older servers omit the list.
 */
export interface FormatIssueLine {
  key: string;
  text: string;
}

const KNOWN = new Set<string>(FORMAT_ISSUE_CODES);

export function formatIssueLines(issues: readonly { code: string; section?: string; factId?: string }[] | undefined): FormatIssueLine[] {
  return (issues ?? [])
    .filter((issue) => KNOWN.has(issue.code))
    .map((issue, index) => ({
      key: `${issue.code}-${issue.factId ?? issue.section ?? index}`,
      text: t(`careerProfile.web.readability.format_${issue.code}`),
    }));
}

export function formatChecksTitle(): string {
  return t('careerProfile.web.readability.format_title');
}

export function formatChecksNote(): string {
  return t('careerProfile.web.readability.format_note');
}
