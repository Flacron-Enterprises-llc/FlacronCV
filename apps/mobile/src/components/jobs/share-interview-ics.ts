import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { t } from '../../i18n';
import { deadlineCalendarFile, interviewCalendarFile } from '../../lib/job-tracker';
import { followUpCalendarFile } from '../../lib/job-workspace';
import type { JobApplication } from '../../types/job.types';

/**
 * Writes an `.ics` (built by the same logic as the website's download) to the
 * cache and opens the share sheet, where the user picks their calendar app —
 * same file-share approach as `src/hooks/useExport.ts`. No calendar permission
 * or OAuth needed.
 */
async function shareIcsFile(file: { filename: string; content: string } | null, dialogTitle: string): Promise<void> {
  if (!file) {
    Alert.alert(t('jobs.calendar.errorTitle'), t('jobs.calendar.error'));
    return;
  }
  try {
    const uri = `${FileSystem.cacheDirectory}${file.filename}`;
    await FileSystem.writeAsStringAsync(uri, file.content, { encoding: FileSystem.EncodingType.UTF8 });
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert(t('jobs.calendar.unavailableTitle'), t('jobs.calendar.unavailable'));
      return;
    }
    await Sharing.shareAsync(uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics', dialogTitle });
  } catch {
    Alert.alert(t('jobs.calendar.errorTitle'), t('jobs.calendar.error'));
  }
}

/** "Add to calendar" for a scheduled interview. */
export function shareInterviewIcs(
  job: Pick<JobApplication, 'company' | 'position' | 'location' | 'jobUrl' | 'interviewDate'>,
): Promise<void> {
  return shareIcsFile(interviewCalendarFile(job), t('jobs.calendar.dialogTitle'));
}

/** "Add deadline to calendar" — an all-day event on the application deadline. */
export function shareDeadlineIcs(
  job: Pick<JobApplication, 'id' | 'company' | 'position' | 'jobUrl' | 'deadline'>,
): Promise<void> {
  return shareIcsFile(deadlineCalendarFile(job), t('jobs.form.addDeadlineToCalendar'));
}

/** "Add follow-up to calendar" — an all-day event on the follow-up date (website parity). */
export function shareFollowUpIcs(
  job: Pick<JobApplication, 'id' | 'company' | 'position' | 'jobUrl' | 'followUpDate'>,
): Promise<void> {
  return shareIcsFile(followUpCalendarFile(job), t('jobs.workspace.calendar.follow_up.button'));
}
