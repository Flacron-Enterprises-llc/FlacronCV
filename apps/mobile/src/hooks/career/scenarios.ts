import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ScenarioLinks, ScenarioList, ScenarioOptionInput, ScenarioResult } from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { useEntitled, useUid } from '../useCareer';

/**
 * Scenario planner (website: career/scenarios). A new comparison is a paid
 * action (one scenario report); the caller keeps the idempotency key so a
 * retry of the same comparison is never charged twice. Reopening, editing and
 * deleting saved comparisons are free. Keys start with ['career', uid].
 */
const listKey = (uid: string | null) => ['career', uid, 'scenarios'] as const;

export function useScenarios() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: listKey(uid), queryFn: () => careerApi.scenarios(), enabled: entitled, retry: false });
}

/** Skill reports, only for the optional link on a route (same key as the learning screens). */
export function useScenarioSkillReports() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'skill-reports'], queryFn: () => careerApi.skillReports(), enabled: entitled, retry: false });
}

function upsert(list: ScenarioList | undefined, item: ScenarioResult, remaining?: number): ScenarioList | undefined {
  if (!list) return list;
  return {
    items: [item, ...list.items.filter((x) => x.id !== item.id)],
    remaining: remaining ?? list.remaining,
  };
}

export function useCreateScenario() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { options: ScenarioOptionInput[]; idempotencyKey: string; title?: string }) =>
      careerApi.createScenario(input.options, input.idempotencyKey, input.title ? { title: input.title } : {}),
    onSuccess: (paid) => {
      queryClient.setQueryData<ScenarioList>(listKey(uid), (list) =>
        upsert(list, paid.result, paid.usage.includedRemaining + paid.usage.packRemaining),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey(uid) });
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}

/** Saves edited assumptions of a saved comparison (recomputed from the person's values; free). */
export function useUpdateScenario() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { id: string; patch: ScenarioLinks & { options?: ScenarioOptionInput[] } }) => careerApi.updateScenario(input.id, input.patch),
    onSuccess: (updated) => {
      queryClient.setQueryData<ScenarioList>(listKey(uid), (list) =>
        list ? { ...list, items: list.items.map((item) => (item.id === updated.id ? updated : item)) } : list,
      );
    },
  });
}

export function useDeleteScenario() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (id: string) => careerApi.deleteScenario(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<ScenarioList>(listKey(uid), (list) => (list ? { ...list, items: list.items.filter((item) => item.id !== id) } : list));
    },
  });
}
