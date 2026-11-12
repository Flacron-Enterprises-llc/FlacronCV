import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { interviewCalendarFile } from '../../lib/job-tracker';
import type { JobApplication } from '../../types/job.types';

/**
 * "Add to calendar" for a scheduled interview: writes the `.ics` (built by the
 * same logic as the website's download) to the cache and opens the share sheet,
 * where the user picks their calendar app — same file-share approach as
 * `src/hooks/useExport.ts`. No calendar permission or OAuth needed.
 */
export async function shareInterviewIcs(
  job: Pick<JobApplication, 'company' | 'position' | 'location' | 'jobUrl' | 'interviewDate'>,
): Promise<void> {
  const file = interviewCalendarFile(job);
  if (!file) {
    Alert.alert('Could not add to calendar', "Couldn't create the calendar event. Please try again.");
    return;
  }
  try {
    const uri = `${FileSystem.cacheDirectory}${file.filename}`;
    await FileSystem.writeAsStringAsync(uri, file.content, { encoding: FileSystem.EncodingType.UTF8 });
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Sharing unavailable', 'Sharing is not available on this device.');
      return;
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'text/calendar',
      UTI: 'com.apple.ical.ics',
      dialogTitle: 'Add interview to calendar',
    });
  } catch {
    Alert.alert('Could not add to calendar', "Couldn't create the calendar event. Please try again.");
  }
}
