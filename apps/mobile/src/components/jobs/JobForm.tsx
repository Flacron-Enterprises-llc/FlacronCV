import { Ionicons } from '@expo/vector-icons';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigation, usePreventRemove } from '@react-navigation/native';
import axios from 'axios';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { z } from 'zod';
import { useCoverLetterList } from '../../hooks/useCoverLetters';
import { useCVList } from '../../hooks/useCVs';
import { useCreateJob, useDeleteJob, useUpdateJob } from '../../hooks/useJobs';
import { requestFailureMessage } from '../../lib/api-errors';
import { cancelJobReminders, syncJobReminder } from '../../lib/job-reminders';
import { maybeAskPushAfterFollowUpSave, type PushPromptResult } from '../../lib/push';
import { toDate } from '../../lib/utils';
import { colors } from '../../theme/colors';
import { CoverLetter } from '../../types/cover-letter.types';
import { CV } from '../../types/cv.types';
import { JobStatus } from '../../types/enums';
import { JobApplication, JobWritePayload } from '../../types/job.types';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/ErrorState';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: JobStatus.WISHLIST, label: 'Wishlist' },
  { value: JobStatus.APPLIED, label: 'Applied' },
  { value: JobStatus.INTERVIEWING, label: 'Interviewing' },
  { value: JobStatus.OFFER, label: 'Offer' },
  { value: JobStatus.REJECTED, label: 'Rejected' },
  { value: JobStatus.ACCEPTED, label: 'Accepted' },
];

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const d = toDate(value);
  if (!d) return false;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}` === value;
}

function isValidDateTime(value: string): boolean {
  if (!DATE_TIME.test(value)) return false;
  const [datePart, timePart] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const local = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (isNaN(local.getTime())) return false;
  return (
    local.getFullYear() === y &&
    local.getMonth() === m - 1 &&
    local.getDate() === d &&
    local.getHours() === hh &&
    local.getMinutes() === mm
  );
}

const schema = z.object({
  position: z.string().trim().min(1, 'Job title is required').max(200),
  company: z.string().trim().min(1, 'Company is required').max(200),
  status: z.nativeEnum(JobStatus),
  appliedDate: z
    .string()
    .refine((s) => s === '' || isValidDateOnly(s), 'Use YYYY-MM-DD'),
  interviewDate: z
    .string()
    .refine((s) => s === '' || isValidDateTime(s), 'Use YYYY-MM-DDTHH:mm'),
  followUpDate: z
    .string()
    .refine((s) => s === '' || isValidDateOnly(s), 'Use YYYY-MM-DD'),
  jobUrl: z.string().max(2048),
  linkedCVId: z.string(),
  linkedCoverLetterId: z.string(),
  notes: z.string().max(5000),
});

type FormData = z.infer<typeof schema>;

const EMPTY: FormData = {
  position: '',
  company: '',
  status: JobStatus.APPLIED,
  appliedDate: '',
  interviewDate: '',
  followUpDate: '',
  jobUrl: '',
  linkedCVId: '',
  linkedCoverLetterId: '',
  notes: '',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Fill a YYYY-MM-DD input from API (ISO date or Firestore timestamp). */
function toDateOnlyInput(value: unknown): string {
  if (typeof value === 'string' && DATE_ONLY.test(value) && isValidDateOnly(value)) {
    return value;
  }
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fill a YYYY-MM-DDTHH:mm input. */
function toDateTimeInput(value: unknown): string {
  if (typeof value === 'string') {
    const sliced = value.length >= 16 ? value.slice(0, 16) : value;
    if (DATE_TIME.test(sliced) && isValidDateTime(sliced)) return sliced;
  }
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function valuesFromJob(job: JobApplication): FormData {
  return {
    position: job.position ?? '',
    company: job.company ?? '',
    status: job.status ?? JobStatus.WISHLIST,
    appliedDate: toDateOnlyInput(job.appliedDate),
    interviewDate: toDateTimeInput(job.interviewDate),
    followUpDate: toDateOnlyInput(job.followUpDate),
    jobUrl: job.jobUrl ?? '',
    linkedCVId: job.linkedCVId ?? '',
    linkedCoverLetterId: job.linkedCoverLetterId ?? '',
    notes: job.notes ?? '',
  };
}

function optionalField(value: string, clearWithNull: boolean): string | null | undefined {
  const trimmed = value.trim();
  if (trimmed) return trimmed;
  return clearWithNull ? null : undefined;
}

function toPayload(data: FormData, isEdit: boolean): JobWritePayload {
  return {
    company: data.company.trim(),
    position: data.position.trim(),
    status: data.status,
    jobUrl: optionalField(data.jobUrl, isEdit),
    appliedDate: optionalField(data.appliedDate, isEdit),
    interviewDate: optionalField(data.interviewDate, isEdit),
    followUpDate: optionalField(data.followUpDate, isEdit),
    notes: optionalField(data.notes, isEdit),
    linkedCVId: optionalField(data.linkedCVId, isEdit),
    linkedCoverLetterId: optionalField(data.linkedCoverLetterId, isEdit),
  };
}

function saveFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return 'No connection. Check your network and try again.';
  }
  return requestFailureMessage(err, 'Could not save. Please try again.');
}

function confirmUnsavedLeave(onLeave: () => void) {
  Alert.alert('Unsaved Changes', 'You have unsaved changes. Leave anyway?', [
    { text: 'Stay', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: onLeave },
  ]);
}

type PickerKind = 'cv' | 'letter' | null;

interface JobFormProps {
  mode: 'create' | 'edit';
  jobId?: string;
  initialJob?: JobApplication;
}

export function JobForm({ mode, jobId, initialJob }: JobFormProps) {
  const router = useRouter();
  const navigation = useNavigation();
  const isEdit = mode === 'edit';
  const createJob = useCreateJob();
  const updateJob = useUpdateJob(jobId ?? '');
  const deleteJob = useDeleteJob();
  const cvsQuery = useCVList(1, 100);
  const lettersQuery = useCoverLetterList(1, 100);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [saving, setSaving] = useState(false);

  const defaults = useMemo(
    () => (initialJob ? valuesFromJob(initialJob) : EMPTY),
    [initialJob],
  );

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const values = watch();
  const isDirty = JSON.stringify(values) !== JSON.stringify(defaults);

  usePreventRemove(isDirty && !saving, ({ data }) => {
    confirmUnsavedLeave(() => navigation.dispatch(data.action));
  });

  const cvs = cvsQuery.data?.items ?? [];
  const letters = lettersQuery.data?.items ?? [];
  const selectedCv = cvs.find((c) => c.id === values.linkedCVId);
  const selectedLetter = letters.find((l) => l.id === values.linkedCoverLetterId);

  const onSubmit = async (data: FormData) => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = toPayload(data, isEdit);
      const saved = isEdit
        ? await updateJob.mutateAsync(payload)
        : await createJob.mutateAsync(payload);
      const hasDates = !!(data.followUpDate.trim() || data.interviewDate.trim());

      const afterSave = async (result: PushPromptResult) => {
        try {
          if (!hasDates) {
            await cancelJobReminders(saved.id);
          } else if (result !== 'declined') {
            await syncJobReminder(saved, {
              skipPreferenceCheck: result === 'granted',
            });
          }
        } catch {
          // Reminders must never fail the save.
        }
        router.back();
      };

      if (hasDates) {
        maybeAskPushAfterFollowUpSave(
          {
            followUp: !!data.followUpDate.trim(),
            interview: !!data.interviewDate.trim(),
          },
          (result) => {
            void afterSave(result);
          },
        );
      } else {
        await afterSave('already');
      }
    } catch (err) {
      Alert.alert('Could not save', saveFailureMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!jobId || !initialJob) return;
    Alert.alert(
      'Delete application',
      `Delete “${initialJob.position}” at ${initialJob.company}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteJob.mutate(jobId, {
              onSuccess: () => {
                void cancelJobReminders(jobId).finally(() => router.back());
              },
              onError: (err) =>
                Alert.alert(
                  'Could not delete',
                  requestFailureMessage(err, 'Failed to delete. Please try again.'),
                ),
            }),
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <View className="flex-row items-center px-5 pt-4 pb-3 bg-white border-b border-stone-100">
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-3"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
        </TouchableOpacity>
        <Text className="text-xl font-black text-stone-900 flex-1" numberOfLines={1}>
          {isEdit ? 'Edit application' : 'Log a job'}
        </Text>
      </View>

      <ScrollView
        className="flex-1 bg-stone-50"
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Controller
          control={control}
          name="position"
          render={({ field }) => (
            <Input
              label="Job title"
              placeholder="e.g. Product designer"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.position?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="company"
          render={({ field }) => (
            <Input
              label="Company"
              placeholder="e.g. Acme"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.company?.message}
            />
          )}
        />

        <Text className="text-sm font-medium text-stone-700 mb-1.5">Status</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {STATUS_OPTIONS.map((opt) => {
            const selected = values.status === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setValue('status', opt.value, { shouldDirty: true })}
                className={[
                  'px-3 py-2 rounded-xl border',
                  selected ? 'bg-brand-600 border-brand-600' : 'bg-white border-stone-200',
                ].join(' ')}
              >
                <Text className={selected ? 'text-white font-semibold text-sm' : 'text-stone-700 text-sm'}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Controller
          control={control}
          name="appliedDate"
          render={({ field }) => (
            <Input
              label="Applied date"
              placeholder="YYYY-MM-DD"
              hint="Optional. Example: 2026-09-08"
              autoCapitalize="none"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.appliedDate?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="interviewDate"
          render={({ field }) => (
            <Input
              label="Interview"
              placeholder="YYYY-MM-DDTHH:mm"
              hint="Optional. Example: 2026-09-12T14:30"
              autoCapitalize="none"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.interviewDate?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="followUpDate"
          render={({ field }) => (
            <Input
              label="Follow-up date"
              placeholder="YYYY-MM-DD"
              hint="Optional. Example: 2026-09-20"
              autoCapitalize="none"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.followUpDate?.message}
            />
          )}
        />

        <Text className="text-sm font-medium text-stone-700 mb-1.5">CV used</Text>
        <TouchableOpacity
          onPress={() => setPicker('cv')}
          className="bg-white border border-stone-200 rounded-xl px-3 py-3 mb-4"
        >
          <Text className={selectedCv ? 'text-stone-900 text-base' : 'text-stone-400 text-base'}>
            {selectedCv?.title ?? 'None'}
          </Text>
        </TouchableOpacity>

        <Text className="text-sm font-medium text-stone-700 mb-1.5">Cover letter used</Text>
        <TouchableOpacity
          onPress={() => setPicker('letter')}
          className="bg-white border border-stone-200 rounded-xl px-3 py-3 mb-4"
        >
          <Text className={selectedLetter ? 'text-stone-900 text-base' : 'text-stone-400 text-base'}>
            {selectedLetter?.title ?? 'None'}
          </Text>
        </TouchableOpacity>

        <Controller
          control={control}
          name="jobUrl"
          render={({ field }) => (
            <Input
              label="Job URL"
              placeholder="https://"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.jobUrl?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <Input
              label="Notes"
              placeholder="Anything to remember"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              className="min-h-[96px]"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.notes?.message}
            />
          )}
        />

        <Button
          variant="primary"
          fullWidth
          loading={saving}
          onPress={handleSubmit(onSubmit)}
        >
          Save
        </Button>

        {isEdit ? (
          <View className="mt-4">
            <Button
              variant="danger"
              fullWidth
              loading={deleteJob.isPending}
              onPress={onDelete}
            >
              Delete
            </Button>
          </View>
        ) : null}
      </ScrollView>

      <DocumentPicker
        kind={picker}
        onClose={() => setPicker(null)}
        cvs={cvs}
        letters={letters}
        cvsQuery={cvsQuery}
        lettersQuery={lettersQuery}
        onSelectCv={(id) => {
          setValue('linkedCVId', id, { shouldDirty: true });
          setPicker(null);
        }}
        onSelectLetter={(id) => {
          setValue('linkedCoverLetterId', id, { shouldDirty: true });
          setPicker(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

function DocumentPicker({
  kind,
  onClose,
  cvs,
  letters,
  cvsQuery,
  lettersQuery,
  onSelectCv,
  onSelectLetter,
}: {
  kind: PickerKind;
  onClose: () => void;
  cvs: CV[];
  letters: CoverLetter[];
  cvsQuery: ReturnType<typeof useCVList>;
  lettersQuery: ReturnType<typeof useCoverLetterList>;
  onSelectCv: (id: string) => void;
  onSelectLetter: (id: string) => void;
}) {
  const isCv = kind === 'cv';
  const query = isCv ? cvsQuery : lettersQuery;
  const items = isCv ? cvs : letters;

  return (
    <Modal
      visible={kind != null}
      onClose={onClose}
      title={isCv ? 'Choose a CV' : 'Choose a cover letter'}
      size="md"
    >
      <TouchableOpacity
        onPress={() => (isCv ? onSelectCv('') : onSelectLetter(''))}
        className="py-3 border-b border-stone-100"
      >
        <Text className="text-stone-500">None</Text>
      </TouchableOpacity>
      {query.error ? (
        <ErrorState
          message={requestFailureMessage(
            query.error,
            isCv ? 'Could not load CVs. Please try again.' : 'Could not load cover letters. Please try again.',
          )}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <Text className="text-stone-400 py-4">Loading…</Text>
      ) : items.length === 0 ? (
        <Text className="text-stone-400 py-4">
          {isCv ? 'No CVs yet.' : 'No cover letters yet.'}
        </Text>
      ) : (
        items.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => (isCv ? onSelectCv(item.id) : onSelectLetter(item.id))}
            className="py-3 border-b border-stone-100"
          >
            <Text className="text-stone-900 font-medium">{item.title}</Text>
          </TouchableOpacity>
        ))
      )}
    </Modal>
  );
}
