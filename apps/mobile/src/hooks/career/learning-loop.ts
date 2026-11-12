import { useQuery } from '@tanstack/react-query';
import { careerApi } from '../../lib/career-api';
import { useEntitled } from '../useCareer';

/** Observed application outcomes (GET /learning-loop). Key starts with ['career', uid]. */
export function useLearningLoop(enabled = true) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'learning-loop'],
    queryFn: () => careerApi.learningLoop(),
    enabled: entitled && enabled,
    retry: false,
  });
}
