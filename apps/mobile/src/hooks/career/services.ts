import { useQuery } from '@tanstack/react-query';
import { careerApi } from '../../lib/career-api';
import { useEntitled } from '../useCareer';

/** Human review services (read-only; booking is closed). */
export function useHumanServices() {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'human-services'],
    queryFn: () => careerApi.humanServices(),
    enabled: entitled,
    retry: false,
  });
}
