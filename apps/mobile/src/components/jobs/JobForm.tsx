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
  useRefreezeJob,
  useUpdateJob,
} from '../../hooks/useJobs';
import { ANSWER_LIMITS, JOB_OUTCOMES, letterText } from '../../lib/job-workspace';
import { ApplicationDrafts } from './ApplicationDrafts';
import { DateInput } from './DateInput';
import { requestFailureMessage } from '../../lib/api-errors';
import { promptForError, showUpgradePrompt } from '../../config/paid-upgrades';
import { planForDisplay } from '../../lib/entitlements';
import { useAuthStore } from '../../store/auth-store';
import { cancelJobReminders, syncJobReminder } from '../../lib/job-reminders';
import {
  duplicateConfirmMessage,
  isValidContactEmail,
  JOB_FIELD_MAX,
  jobContacts,
  jobOutcomeLabel,
  jobStatusLabel,
  normalizeStatus,
  optionalJobField,
  STATUS_ORDER,
} from '../../lib/job-tracker';
import { maybeAskPushAfterFollowUpSave, type PushPromptResult } from '../../lib/push';
import { toDate } from '../../lib/utils';
import { colors } from '../../theme/colors';
import { CoverLetter } from '../../types/cover-letter.types';
import { CV } from '../../types/cv.types';
import { JobStatus } from '../../types/enums';
import { JOB_LIMITS, JobApplication, JobWritePayload } from '../../types/job.types';
import { Button } from '../ui/Button';
import { ErrorState } from '../ui/ErrorState';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { shareDeadlineIcs, shareFollowUpIcs, shareInterviewIcs } from './share-interview-ics';

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
    deadline: z
      .string()
      .refine((s) => s === '' || isValidDateOnly(s), t('form.dateFormat')),
    location: z.string().max(JOB_FIELD_MAX.location, t('form.tooLong200')),
    salaryRange: z.string().max(JOB_FIELD_MAX.salaryRange, t('form.tooLong100')),
    contacts: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().max(JOB_LIMITS.contactName, t('form.tooLong200')),
          role: z.string().max(JOB_LIMITS.contactRole, t('form.tooLong200')),
          email: z
            .string()
            .max(JOB_LIMITS.contactEmail)
            .refine((s) => isValidContactEmail(s), t('form.invalidEmail')),
          phone: z.string().max(JOB_LIMITS.contactPhone),
          notes: z.string().max(JOB_LIMITS.contactNotes),
        }),
      )
      .max(JOB_LIMITS.contacts),
    checklist: z
      .array(
        z.object({
          id: z.string().optional(),
          label: z.string().max(JOB_LIMITS.checklistLabel),
          kind: z.enum(['document', 'task']),
          done: z.boolean(),
        }),
      )
      .max(JOB_LIMITS.checklistItems),
    jobUrl: z.string().max(2048),
    jobDescription: z.string().max(ANSWER_LIMITS.description),
    formAnswers: z
      .array(
        z.object({
          id: z.string().optional(),
          question: z.string().max(ANSWER_LIMITS.question),
          answer: z.string().max(ANSWER_LIMITS.answer),
        }),
      )
      .max(ANSWER_LIMITS.formAnswers),
    outcome: z.string(),
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
  deadline: '',
  location: '',
  salaryRange: '',
  contacts: [],
  checklist: [],
  jobUrl: '',
  jobDescription: '',
  formAnswers: [],
  outcome: '',
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
    status: normalizeStatus(job.status),
    appliedDate: toDateOnlyInput(job.appliedDate),
    interviewDate: toDateTimeInput(job.interviewDate),
    followUpDate: toDateOnlyInput(job.followUpDate),
    deadline: toDateOnlyInput(job.deadline),
    location: job.location ?? '',
    salaryRange: job.salaryRange ?? '',
    contacts: jobContacts(job).map((c) => ({
      id: c.id,
      name: c.name ?? '',
      role: c.role ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      notes: c.notes ?? '',
    })),
    checklist: (job.checklist ?? []).map((i) => ({ id: i.id, label: i.label, kind: i.kind, done: i.done })),
    jobUrl: job.jobUrl ?? '',
    jobDescription: job.jobDescription ?? '',
    formAnswers: (job.formAnswers ?? []).map((a) => ({ id: a.id, question: a.question, answer: a.answer })),
    outcome: job.outcome ?? '',
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
    appliedDate: optionalJobField(data.appliedDate, isEdit),
    interviewDate: optionalJobField(data.interviewDate, isEdit),
    followUpDate: optionalJobField(data.followUpDate, isEdit),
    deadline: optionalJobField(data.deadline, isEdit),
    // Lists are sent whole; the server keeps the ids it is given and drops empty rows.
    contacts: data.contacts.map((c) => ({
      id: c.id,
      name: c.name.trim(),
      role: c.role.trim() || null,
      email: c.email.trim() || null,
      phone: c.phone.trim() || null,
      notes: c.notes.trim() || null,
    })),
    checklist: data.checklist.map((i) => ({ id: i.id, label: i.label.trim(), kind: i.kind, done: i.done })),
    // Rows with neither a question nor an answer are left out; the server keeps the ids it is given.
    formAnswers: data.formAnswers
      .filter((a) => a.question.trim() || a.answer.trim())
      .map((a) => ({ id: a.id, question: a.question.trim(), answer: a.answer.trim() })),
    jobDescription: optionalJobField(data.jobDescription, isEdit),
    // Only an edit can report how it ended; a cleared choice is sent as null ("not decided yet").
    ...(isEdit ? { outcome: (data.outcome || null) as JobWritePayload['outcome'] } : {}),
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
  const refreeze = useRefreezeJob(jobId ?? '');
  const [letterOpen, setLetterOpen] = useState(false);
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
      const hasDates = !!(data.followUpDate.trim() || data.interviewDate.trim() || data.deadline.trim());
      // The permission prompt names follow-ups and interviews; a deadline alone is scheduled only when notifications are already on.
      const askFor = !!(data.followUpDate.trim() || data.interviewDate.trim());

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

      if (askFor) {
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
      // JOB_CAPACITY_REACHED and other plan refusals: say which plan includes more.
      const prompt = promptForError(err, planForDisplay(useAuthStore.getState().user?.subscription));
      if (prompt) {
        showUpgradePrompt(prompt, () => router.push('/(dashboard)/settings/plans'));
        return;
      }
      Alert.alert(t('form.saveErrorTitle'), saveFailureMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // The job as last saved: a "use current version" result replaces the snapshots shown here.
  const snapshot = refreeze.data ?? initialJob;

  const onRefreeze = (kind: 'cv' | 'cover_letter') => {
    if (!jobId || refreeze.isPending) return;
    refreeze.mutate(kind, {
      onSuccess: () => Alert.alert(t('workspace.refrozen')),
      onError: (err) => Alert.alert(t('form.saveErrorTitle'), requestFailureMessage(err, t('form.saveError'))),
    });
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
      <View className="flex-row items-center px-5 pt-4 pb-3 bg-surface border-b border-stone-100">
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
                  selected ? 'bg-brand-600 border-brand-600' : 'bg-surface border-stone-200',
                ].join(' ')}
              >
                <Text className={selected ? 'text-white font-semibold text-sm' : 'text-stone-700 text-sm'}>
                  {jobStatusLabel(status)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {initialJob && jobOutcomeLabel(initialJob) ? (
          <Text className="text-stone-600 text-sm mb-4">
            {t('form.outcome', { outcome: jobOutcomeLabel(initialJob) ?? '' })}
          </Text>
        ) : null}

        <Controller
          control={control}
          name="appliedDate"
          render={({ field }) => (
            <DateInput
              label={t('form.appliedDate')}
              value={field.value}
              onChange={field.onChange}
              error={errors.appliedDate?.message}
              quickPicks={[0]}
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
          name="interviewDate"
          render={({ field }) => (
            <DateInput
              label={t('form.interview')}
              value={field.value}
              onChange={field.onChange}
              error={errors.interviewDate?.message}
              withTime
              hint={t('form.optionalExample', { example: '2026-09-12T14:30' })}
            />
          )}
        />
        <Controller
          control={control}
          name="followUpDate"
          render={({ field }) => (
            <DateInput
              label={t('form.followUpDate')}
              value={field.value}
              onChange={field.onChange}
              error={errors.followUpDate?.message}
              quickPicks={[3, 7, 14]}
            />
          )}
        />
        <Controller
          control={control}
          name="deadline"
          render={({ field }) => (
            <DateInput
              label={t('form.deadline')}
              value={field.value}
              onChange={field.onChange}
              error={errors.deadline?.message}
              quickPicks={[7, 14, 30]}
            />
          )}
        />

        <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('form.cvUsed')}</Text>
        <TouchableOpacity
          onPress={() => setPicker('cv')}
          className="bg-surface border border-stone-200 rounded-xl px-3 py-3 mb-4"
        >
          <Text className={selectedCv ? 'text-stone-900 text-base' : 'text-stone-400 text-base'}>
            {selectedCv?.title ?? t('form.none')}
          </Text>
        </TouchableOpacity>

        <Text className="text-sm font-medium text-stone-700 mb-1.5">{t('form.letterUsed')}</Text>
        <TouchableOpacity
          onPress={() => setPicker('letter')}
          className="bg-surface border border-stone-200 rounded-xl px-3 py-3 mb-4"
        >
          <Text className={selectedLetter ? 'text-stone-900 text-base' : 'text-stone-400 text-base'}>
            {selectedLetter?.title ?? t('form.none')}
          </Text>
        </TouchableOpacity>
        <Text className="text-stone-500 text-xs -mt-2 mb-1">{t('form.frozenOnLink')}</Text>
        {snapshot?.cvSnapshot ? (
          <View className="flex-row flex-wrap items-center mb-1">
            <Text className="text-stone-500 text-xs me-2">
              {t('form.frozenCv', {
                title: snapshot.cvSnapshot.title,
                version: snapshot.cvSnapshot.versionNumber ?? '—',
              })}
            </Text>
            <SmallLink label={t('workspace.refreeze')} disabled={refreeze.isPending} onPress={() => onRefreeze('cv')} />
          </View>
        ) : null}
        {snapshot?.coverLetterSnapshot ? (
          <View className="mb-1">
            <View className="flex-row flex-wrap items-center">
              <Text className="text-stone-500 text-xs me-2">{t('form.frozenLetter', { title: snapshot.coverLetterSnapshot.title })}</Text>
              <SmallLink label={letterOpen ? t('workspace.hide_letter') : t('workspace.show_letter')} onPress={() => setLetterOpen((v) => !v)} expanded={letterOpen} />
              <SmallLink label={t('workspace.refreeze')} disabled={refreeze.isPending} onPress={() => onRefreeze('cover_letter')} />
            </View>
            {letterOpen ? (
              <Text className="text-stone-700 text-xs bg-stone-100 rounded-xl p-3 mt-1 leading-5" selectable>
                {[letterText(snapshot.coverLetterSnapshot.content), snapshot.coverLetterSnapshot.truncated ? t('workspace.letter_truncated') : null].filter(Boolean).join('\n')}
              </Text>
            ) : null}
          </View>
        ) : null}
        {snapshot?.cvSnapshot || snapshot?.coverLetterSnapshot ? <Text className="text-stone-400 text-xs mb-1">{t('workspace.frozen_help')}</Text> : null}
        <View className="mb-4" />

        <Text className="text-base font-bold text-stone-900 mt-2 mb-2">{t('workspace.section.description')}</Text>
        <Controller
          control={control}
          name="jobDescription"
          render={({ field }) => (
            <Input
              placeholder={t('workspace.description_ph')}
              accessibilityLabel={t('workspace.section.description')}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              className="min-h-[140px]"
              maxLength={ANSWER_LIMITS.description}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.jobDescription?.message}
              hint={[
                initialJob?.jobDescription && field.value === initialJob.jobDescription
                  ? initialJob.jobDescriptionSource === 'opportunity'
                    ? t('workspace.description_from_opportunity')
                    : t('workspace.description_pasted')
                  : null,
                `${field.value.length} / ${ANSWER_LIMITS.description}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          )}
        />

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

        <Text className="text-base font-bold text-stone-900 mt-2 mb-2">{t('form.contacts')}</Text>
        {values.contacts.map((contact, index) => {
          const n = index + 1;
          const set = (patch: Partial<FormData['contacts'][number]>) =>
            setValue(
              'contacts',
              values.contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)),
              { shouldDirty: true, shouldValidate: !!errors.contacts },
            );
          const rowErrors = errors.contacts?.[index];
          return (
            <View key={contact.id ?? `new-${index}`} className="bg-surface border border-stone-200 rounded-xl p-3 mb-3">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-semibold text-stone-700">{t('form.contactN', { n })}</Text>
                <TouchableOpacity
                  onPress={() => setValue('contacts', values.contacts.filter((_, i) => i !== index), { shouldDirty: true })}
                  className="w-11 h-11 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel={t('form.removeContact', { n })}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.stone[500]} />
                </TouchableOpacity>
              </View>
              <Input
                label={t('form.contactName')}
                placeholder={t('form.contactNamePh')}
                value={contact.name}
                onChangeText={(name) => set({ name })}
                error={rowErrors?.name?.message}
              />
              <Input
                label={t('form.contactRole')}
                placeholder={t('form.contactRolePh')}
                value={contact.role}
                onChangeText={(role) => set({ role })}
                error={rowErrors?.role?.message}
              />
              <Input
                label={t('form.contactEmail')}
                placeholder="recruiter@company.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                value={contact.email}
                onChangeText={(email) => set({ email })}
                error={rowErrors?.email?.message}
              />
              <Input
                label={t('form.contactPhone')}
                keyboardType="phone-pad"
                textContentType="telephoneNumber"
                value={contact.phone}
                onChangeText={(phone) => set({ phone })}
              />
              <Input
                label={t('form.contactNotes')}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
                value={contact.notes}
                onChangeText={(notes) => set({ notes })}
              />
            </View>
          );
        })}
        {values.contacts.length < JOB_LIMITS.contacts ? (
          <TouchableOpacity
            onPress={() =>
              setValue('contacts', [...values.contacts, { name: '', role: '', email: '', phone: '', notes: '' }], {
                shouldDirty: true,
              })
            }
            className="flex-row items-center min-h-[44px] mb-4"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.brand[600]} />
            <Text className="text-brand-600 font-semibold ms-1.5">{t('form.addContact')}</Text>
          </TouchableOpacity>
        ) : null}

        <Text className="text-base font-bold text-stone-900 mt-2 mb-2">{t('form.checklist')}</Text>
        {values.checklist.map((item, index) => {
          const n = index + 1;
          const set = (patch: Partial<FormData['checklist'][number]>) =>
            setValue(
              'checklist',
              values.checklist.map((c, i) => (i === index ? { ...c, ...patch } : c)),
              { shouldDirty: true },
            );
          return (
            <View key={item.id ?? `new-${index}`} className="flex-row items-center mb-2">
              <TouchableOpacity
                onPress={() => set({ done: !item.done })}
                className="w-11 h-11 items-center justify-center"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                accessibilityLabel={t('form.checklistToggle', { n })}
              >
                <Ionicons
                  name={item.done ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={item.done ? colors.brand[600] : colors.stone[400]}
                />
              </TouchableOpacity>
              <View className="flex-1">
                <Input
                  placeholder={t('form.checklistItemPh')}
                  value={item.label}
                  onChangeText={(label) => set({ label })}
                  accessibilityLabel={t('form.checklistItemPh')}
                />
              </View>
              <TouchableOpacity
                onPress={() => setValue('checklist', values.checklist.filter((_, i) => i !== index), { shouldDirty: true })}
                className="w-11 h-11 items-center justify-center"
                accessibilityRole="button"
                accessibilityLabel={t('form.removeChecklistItem', { n })}
              >
                <Ionicons name="trash-outline" size={18} color={colors.stone[500]} />
              </TouchableOpacity>
            </View>
          );
        })}
        {values.checklist.length < JOB_LIMITS.checklistItems ? (
          <TouchableOpacity
            onPress={() =>
              setValue('checklist', [...values.checklist, { label: '', kind: 'task', done: false }], { shouldDirty: true })
            }
            className="flex-row items-center min-h-[44px] mb-4"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.brand[600]} />
            <Text className="text-brand-600 font-semibold ms-1.5">{t('form.addChecklistItem')}</Text>
          </TouchableOpacity>
        ) : null}

        <Text className="text-base font-bold text-stone-900 mt-2 mb-2">{t('workspace.section.form_answers')}</Text>
        {values.formAnswers.map((row, index) => {
          const n = index + 1;
          const set = (patch: Partial<FormData['formAnswers'][number]>) =>
            setValue(
              'formAnswers',
              values.formAnswers.map((a, i) => (i === index ? { ...a, ...patch } : a)),
              { shouldDirty: true },
            );
          return (
            <View key={row.id ?? `new-answer-${index}`} className="bg-surface border border-stone-200 rounded-xl p-3 mb-3">
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-sm font-semibold text-stone-700">{t('workspace.answer.question_n', { n })}</Text>
                <TouchableOpacity
                  onPress={() => setValue('formAnswers', values.formAnswers.filter((_, i) => i !== index), { shouldDirty: true })}
                  className="w-11 h-11 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel={t('workspace.answer.remove', { n })}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.stone[500]} />
                </TouchableOpacity>
              </View>
              <Input
                placeholder={t('workspace.answer.question_ph')}
                accessibilityLabel={t('workspace.answer.question_n', { n })}
                value={row.question}
                maxLength={ANSWER_LIMITS.question}
                onChangeText={(question) => set({ question })}
              />
              <Input
                placeholder={t('workspace.answer.answer_ph')}
                accessibilityLabel={t('workspace.answer.answer_n', { n })}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                className="min-h-[80px]"
                value={row.answer}
                maxLength={ANSWER_LIMITS.answer}
                onChangeText={(answer) => set({ answer })}
              />
            </View>
          );
        })}
        {values.formAnswers.length < ANSWER_LIMITS.formAnswers ? (
          <TouchableOpacity
            onPress={() => setValue('formAnswers', [...values.formAnswers, { question: '', answer: '' }], { shouldDirty: true })}
            className="flex-row items-center min-h-[44px] mb-4"
            accessibilityRole="button"
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.brand[600]} />
            <Text className="text-brand-600 font-semibold ms-1.5">{t('workspace.answer.add')}</Text>
          </TouchableOpacity>
        ) : null}

        {isEdit ? (
          <View className="mb-4">
            <Text className="text-base font-bold text-stone-900 mt-2 mb-2">{t('workspace.outcome_label')}</Text>
            <View className="flex-row flex-wrap" accessibilityRole="radiogroup" accessibilityLabel={t('workspace.outcome_label')}>
              {['', ...JOB_OUTCOMES].map((outcome) => {
                const selected = values.outcome === outcome;
                const label = outcome ? t(`outcome.${outcome}`) : t('workspace.outcome_none');
                return (
                  <TouchableOpacity
                    key={outcome || 'none'}
                    onPress={() => setValue('outcome', outcome, { shouldDirty: true })}
                    className={`min-h-[44px] justify-center px-3 me-2 mb-2 rounded-xl border ${selected ? 'bg-brand-600 border-brand-600' : 'bg-surface border-stone-200'}`}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <Text className={selected ? 'text-white font-semibold text-sm' : 'text-stone-700 text-sm'}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text className="text-stone-400 text-xs leading-4">{t('workspace.outcome_help')}</Text>
          </View>
        ) : null}

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
            {initialJob.followUpDate ? (
              <Button
                variant="outline"
                fullWidth
                icon={<Ionicons name="alarm-outline" size={18} color={colors.stone[700]} />}
                onPress={() => void shareFollowUpIcs(initialJob)}
              >
                {t('workspace.calendar.follow_up.button')}
              </Button>
            ) : null}
            {initialJob.deadline ? (
              <Button
                variant="outline"
                fullWidth
                icon={<Ionicons name="flag-outline" size={18} color={colors.stone[700]} />}
                onPress={() => void shareDeadlineIcs(initialJob)}
              >
                {t('form.addDeadlineToCalendar')}
              </Button>
            ) : null}
            <ApplicationDrafts job={snapshot ?? initialJob} />
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

function SmallLink({ label, onPress, disabled, expanded }: { label: string; onPress: () => void; disabled?: boolean; expanded?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className="min-h-[44px] justify-center me-3"
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded }}
    >
      <Text className={`text-xs font-semibold ${disabled ? 'text-stone-400' : 'text-brand-600'}`}>{label}</Text>
    </TouchableOpacity>
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
