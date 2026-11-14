import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SkillGapReport, SkillReportList } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { replacePack } from '../../lib/career/action-packs';
import { withMilestone, withMilestoneEvidence, type SkillReportInput } from '../../lib/career/learning';
import { useEntitled, useUid } from '../useCareer';

/**
 * Skill reports and learning plans (website: career/learning). Keys start
 * with ['career', uid].
 */
const listKey = (uid: string | null) => ['career', uid, 'skill-reports'] as const;
const reportKey = (uid: string | null, id: string | undefined) => ['career', uid, 'skill-reports', 'item', id] as const;

export function useSkillReports() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: listKey(uid), queryFn: () => careerApi.skillReports(), enabled: entitled });
}

export function useSkillReport(id: string | undefined) {
  const { uid, entitled } = useEntitled();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: reportKey(uid, id),
    queryFn: () => careerApi.getSkillReport(id as string),
    enabled: entitled && Boolean(id),
    placeholderData: () => queryClient.getQueryData<SkillReportList>(listKey(uid))?.items.find((r) => r.id === id),
  });
}

function sortReports(items: SkillGapReport[]): SkillGapReport[] {
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** One paid action: the caller keeps the idempotency key for retries of the same action. */
export function useCreateSkillReport() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { body: SkillReportInput; idempotencyKey: string }) => careerApi.createSkillReport(input.body, input.idempotencyKey),
    onSuccess: (paid) => {
      queryClient.setQueryData<SkillReportList>(listKey(uid), (current) =>
        current
          ? {
              items: sortReports([paid.report, ...current.items.filter((r) => r.id !== paid.report.id)]),
              skillReport: { ...current.skillReport, includedRemaining: paid.usage.includedRemaining, packRemaining: paid.usage.packRemaining },
            }
          : current,
      );
      queryClient.setQueryData(reportKey(uid, paid.report.id), paid.report);
      void queryClient.invalidateQueries({ queryKey: listKey(uid), exact: true });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}

/** Ticks or unticks a milestone (free). Optimistic, rolled back if the server refuses. */
export function useToggleMilestone(reportId: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  const writeBoth = (report: SkillGapReport) => {
    queryClient.setQueryData(reportKey(uid, report.id), report);
    queryClient.setQueryData<SkillReportList>(listKey(uid), (current) => (current ? { ...current, items: replacePack(current.items, report) } : current));
  };
  return useMutation({
    mutationFn: (input: { milestoneId: string; completed: boolean }) =>
      careerApi.updateLearningProgress(reportId as string, input.milestoneId, input.completed),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: reportKey(uid, reportId) });
      const previous = queryClient.getQueryData<SkillGapReport>(reportKey(uid, reportId));
      if (previous) writeBoth(withMilestone(previous, input.milestoneId, input.completed));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) writeBoth(context.previous);
    },
    onSuccess: (report) => writeBoth(report),
  });
}

/**
 * Records a ticked milestone as a self-reported evidence item (free). The
 * server returns the existing item on a repeat, so the report remembers it.
 */
export function useConvertMilestone(reportId: string | undefined) {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (milestoneId: string) => careerApi.convertMilestoneToEvidence(reportId as string, milestoneId),
    onSuccess: (result, milestoneId) => {
      const record = (report: SkillGapReport) => withMilestoneEvidence(report, milestoneId, result.evidenceId);
      queryClient.setQueryData<SkillGapReport>(reportKey(uid, reportId), (current) => (current ? record(current) : current));
      queryClient.setQueryData<SkillReportList>(listKey(uid), (current) =>
        current ? { ...current, items: current.items.map((r) => (r.id === reportId ? record(r) : r)) } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'evidence'] });
    },
  });
}
