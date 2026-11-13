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
import { t as tNow, useT } from '../../i18n';
import { RTL_FLIP } from '../../i18n/native';
import {
  findDuplicateJob,
  useArchiveJob,
  useCreateJob,
  useDeleteJob,
  useUpdateJob,
} from '../../hooks/useJobs';
import { requestFailureMessage } from '../../lib/api-errors';
import { cancelJobReminders, syncJobReminder } from '../../lib/job-reminders';
import {
  duplicateConfirmMessage,
  isValidContactEmail,
  JOB_FIELD_MAX,
  jobStatusLabel,
  optionalJobField,
  STATUS_ORDER,
} from '../../lib/job-tracker';
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
import { shareInterviewIcs } from './share-interview-ics';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

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

/** Built per language (zod messages are fixed when the schema is made). */
function makeSchema(t: (key: string) => string) {
  return z.object({
    position: z.string().trim().min(1, t('form.jobTitleRequired')).max(200),
    company: z.string().trim().min(1, t('form.companyRequired')).max(200),
    status: z.nativeEnum(JobStatus),
    appliedDate: z
      .string()
      .refine((s) => s === '' || isValidDateOnly(s), t('form.dateFormat')),
    interviewDate: z
      .string()
      .refine((s) => s === '' || isValidDateTime(s), t('form.dateTimeFormat')),
    followUpDate: z
      .string()
      .refine((s) => s === '' || isValidDateOnly(s), t('form.dateFormat')),
    location: z.string().max(JOB_FIELD_MAX.location, t('form.tooLong200')),
    salaryRange: z.string().max(JOB_FIELD_MAX.salaryRange, t('form.tooLong100')),
    contactName: z.string().max(JOB_FIELD_MAX.contactName, t('form.tooLong200')),
    contactEmail: z
      .string()
      .max(JOB_FIELD_MAX.contactEmail)
      .refine((s) => isValidContactEmail(s), t('form.invalidEmail')),
    jobUrl: z.string().max(2048),
    linkedCVId: z.string(),
    linkedCoverLetterId: z.string(),
    notes: z.string().max(5000),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

const EMPTY: FormData = {
  position: '',
  company: '',
  status: JobStatus.APPLIED,
  appliedDate: '',
  interviewDate: '',
  followUpDate: '',
  location: '',
  salaryRange: '',
  contactName: '',
  contactEmail: '',
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
    location: job.location ?? '',
    salaryRange: job.salaryRange ?? '',
    contactName: job.contactName ?? '',
    contactEmail: job.contactEmail ?? '',
    jobUrl: job.jobUrl ?? '',
    linkedCVId: job.linkedCVId ?? '',
    linkedCoverLetterId: job.linkedCoverLetterId ?? '',
    notes: job.notes ?? '',
  };
}

function toPayload(data: FormData, isEdit: boolean): JobWritePayload {
  return {
    company: data.company.trim(),
    position: data.position.trim(),
    status: data.status,
    jobUrl: optionalJobField(data.jobUrl, isEdit),
    location: optionalJobField(data.location, isEdit),
    salaryRange: optionalJobField(data.salaryRange, isEdit),
    contactName: optionalJobField(data.contactName, isEdit),
    contactEmail: optionalJobField(data.contactEmail, isEdit),
    appliedDate: optionalJobField(data.appliedDate, isEdit),
    interviewDate: optionalJobField(data.interviewDate, isEdit),
    followUpDate: optionalJobField(data.followUpDate, isEdit),
    notes: optionalJobField(data.notes, isEdit),
    linkedCVId: optionalJobField(data.linkedCVId, isEdit),
    linkedCoverLetterId: optionalJobField(data.linkedCoverLetterId, isEdit),
  };
}

function saveFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return tNow('common.noConnection');
  }
  return requestFailureMessage(err, tNow('jobs.form.saveError'));
}

/** Website parity: applying to the same role twice is allowed, just never unnoticed. */
function confirmDuplicate(dup: JobApplication): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(tNow('jobs.form.duplicateTitle'), duplicateConfirmMessage(dup), [
      { text: tNow('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
      { text: tNow('jobs.form.addAnyway'), onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

function confirmUnsavedLeave(onLeave: () => void) {
  Alert.alert(tNow('common.unsaved.title'), tNow('common.unsaved.body'), [
    { text: tNow('common.unsaved.stay'), style: 'cancel' },
    { text: tNow('common.unsaved.leave'), style: 'destructive', onPress: onLeave },
  ]);
}

type PickerKind = 'cv' | 'letter' | null;

interface JobFormProps {
  mode: 'create' | 'edit';
  jobId?: string;
  initialJob?: JobApplication;
}

export function JobForm({ mode, jobId, initialJob }: JobFormProps) {
  const t = useT('jobs');
  const tc = useT('common');
  const schema = useMemo(() => makeSchema(t), [t]);
  const router = useRouter();
  const navigation = useNavigation();
  const isEdit = mode === 'edit';
  const createJob = useCreateJob();
  const updateJob = useUpdateJob(jobId ?? '');
  const deleteJob = useDeleteJob();
  const archiveJob = useArchiveJob();
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
      if (!isEdit) {
        let duplicate: JobApplication | null = null;
        try {
          duplicate = await findDuplicateJob(payload.company, payload.position);
        } catch {
          // A failed check must not block the user from saving.
        }
        if (duplicate && !(await confirmDuplicate(duplicate))) return;
      }
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
      Alert.alert(t('form.saveErrorTitle'), saveFailureMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    if (!jobId || !initialJob) return;
    Alert.alert(
      t('form.deleteTitle'),
      t('form.deleteBody', { position: initialJob.position, company: initialJob.company }),
      [
        { text: tc('cancel'), style: 'cancel' },
        {
          text: tc('delete'),
          style: 'destructive',
          onPress: () =>
            deleteJob.mutate(jobId, {
              onSuccess: () => {
                void cancelJobReminders(jobId).finally(() => router.back());
              },
              onError: (err) =>
                Alert.alert(
                  t('form.deleteErrorTitle'),
                  requestFailureMessage(err, t('form.deleteError')),
                ),
            }),
        },
      ],
    );
  };

  const onToggleArchive = () => {
    if (!initialJob) return;
    const archived = !initialJob.archived;
    archiveJob.mutate(
      { job: initialJob, archived },
      {
        onSuccess: () => {
          Alert.alert(archived ? t('archive.archived') : t('archive.restored'));
          router.back();
        },
        onError: (err) =>
          Alert.alert(t('form.saveErrorTitle'), requestFailureMessage(err, t('form.archiveError'))),
      },
    );
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
    >
      <View className="flex-row items-center px-5 pt-4 pb-3 bg-white border-b border-stone-100">
        <TouchableOpacity
          onPress={() => router.back()}
          className="me-3"
          accessibilityLabel={t('goBack')}
        >
          <Ionicons name="arrow-back" size={22} color={colors.stone[700]} style={RTL_FLIP} />
        </TouchableOpacity>
        <Text className="text-xl font-black text-stone-900 flex-1" numberOfLines={1}>
          {isEdit ? t('form.editTitle') : t('form.newTitle')}
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
              label={t('form.jobTitle')}
              placeholder={t('form.jobTitlePh')}
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
              label={t('form.company')}
              placeholder={t('form.companyPh')}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.company?.message}
            />
          )}
        />

        <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('form.status')}</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {STATUS_ORDER.map((status) => {
            const selected = values.status === status;
            return (
              <TouchableOpacity
                key={status}
                onPress={() => setValue('status', status, { shouldDirty: true })}
                className={[
                  'px-3 py-2 rounded-xl border',
                  selected ? 'bg-brand-600 border-brand-600' : 'bg-white border-stone-200',
                ].join(' ')}
              >
                <Text className={selected ? 'text-white font-semibold text-sm' : 'text-stone-700 text-sm'}>
                  {jobStatusLabel(status)}
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
              label={t('form.appliedDate')}
              placeholder="YYYY-MM-DD"
              hint={t('form.optionalExample', { example: '2026-09-08' })}
              autoCapitalize="none"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.appliedDate?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="location"
          render={({ field }) => (
            <Input
              label={t('form.location')}
              placeholder={t('form.locationPh')}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.location?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="jobUrl"
          render={({ field }) => (
            <Input
              label={t('form.jobUrl')}
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
          name="salaryRange"
          render={({ field }) => (
            <Input
              label={t('form.salaryRange')}
              placeholder={t('form.salaryRangePh')}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.salaryRange?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="contactName"
          render={({ field }) => (
            <Input
              label={t('form.contactName')}
              placeholder={t('form.contactNamePh')}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.contactName?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="contactEmail"
          render={({ field }) => (
            <Input
              label={t('form.contactEmail')}
              placeholder="recruiter@company.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.contactEmail?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="interviewDate"
          render={({ field }) => (
            <Input
              label={t('form.interview')}
              placeholder="YYYY-MM-DDTHH:mm"
              hint={t('form.optionalExample', { example: '2026-09-12T14:30' })}
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
              label={t('form.followUpDate')}
              placeholder="YYYY-MM-DD"
              hint={t('form.optionalExample', { example: '2026-09-20' })}
              autoCapitalize="none"
              value={field.value}
              onChangeText={field.onChange}
              error={errors.followUpDate?.message}
            />
          )}
        />

        <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('form.cvUsed')}</Text>
        <TouchableOpacity
          onPress={() => setPicker('cv')}
          className="bg-white border border-stone-200 rounded-xl px-3 py-3 mb-4"
        >
          <Text className={selectedCv ? 'text-stone-900 text-base' : 'text-stone-400 text-base'}>
            {selectedCv?.title ?? t('form.none')}
          </Text>
        </TouchableOpacity>

        <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('form.letterUsed')}</Text>
        <TouchableOpacity
          onPress={() => setPicker('letter')}
          className="bg-white border border-stone-200 rounded-xl px-3 py-3 mb-4"
        >
          <Text className={selectedLetter ? 'text-stone-900 text-base' : 'text-stone-400 text-base'}>
            {selectedLetter?.title ?? t('form.none')}
          </Text>
        </TouchableOpacity>

        <Controller
          control={control}
          name="notes"
          render={({ field }) => (
            <Input
              label={t('form.notes')}
              placeholder={t('form.notesPh')}
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
          {tc('save')}
        </Button>

        {isEdit && initialJob ? (
          <View className="mt-4 gap-3">
            {initialJob.interviewDate ? (
              <Button
                variant="outline"
                fullWidth
                icon={<Ionicons name="calendar-outline" size={18} color={colors.stone[700]} />}
                onPress={() => void shareInterviewIcs(initialJob)}
                accessibilityLabel={t('form.addToCalendarA11y')}
              >
                {t('form.addToCalendar')}
              </Button>
            ) : null}
            <Button
              variant="outline"
              fullWidth
              loading={archiveJob.isPending}
              icon={<Ionicons name={initialJob.archived ? 'arrow-undo-outline' : 'archive-outline'} size={18} color={colors.stone[700]} />}
              onPress={onToggleArchive}
            >
              {initialJob.archived ? t('form.restore') : t('form.archive')}
            </Button>
          </View>
        ) : null}

        {isEdit ? (
          <View className="mt-4">
            <Button
              variant="danger"
              fullWidth
              loading={deleteJob.isPending}
              onPress={onDelete}
            >
              {tc('delete')}
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
  const t = useT('jobs');
  const tc = useT('common');
  const isCv = kind === 'cv';
  const query = isCv ? cvsQuery : lettersQuery;
  const items = isCv ? cvs : letters;

  return (
    <Modal
      visible={kind != null}
      onClose={onClose}
      title={isCv ? t('picker.chooseCv') : t('picker.chooseLetter')}
      size="md"
    >
      <TouchableOpacity
        onPress={() => (isCv ? onSelectCv('') : onSelectLetter(''))}
        className="py-3 border-b border-stone-100"
      >
        <Text className="text-stone-500">{t('form.none')}</Text>
      </TouchableOpacity>
      {query.error ? (
        <ErrorState
          message={requestFailureMessage(
            query.error,
            isCv ? t('picker.loadCvsError') : t('picker.loadLettersError'),
          )}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <Text className="text-stone-400 py-4">{tc('loading')}</Text>
      ) : items.length === 0 ? (
        <Text className="text-stone-400 py-4">
          {isCv ? t('picker.noCvs') : t('picker.noLetters')}
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
