import { useMutation, useQueryClient } from '@tanstack/react-query';
import { careerApi } from '../../lib/career-api';
import type { ScenarioOptionInput } from '../../lib/career/scenarios';
import { useUid } from '../useCareer';

/**
 * Scenario planner (website: career/scenarios). The comparison is a paid
 * action (one scenario-report credit); the caller keeps the idempotency key
 * so a retry of the same comparison is never charged twice.
 */
export function useCreateScenario() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (input: { options: ScenarioOptionInput[]; idempotencyKey: string }) => careerApi.createScenario(input.options, input.idempotencyKey),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['career', uid, 'usage'] });
    },
  });
}
