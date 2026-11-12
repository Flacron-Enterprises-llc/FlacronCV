import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePortfolioInput,
  PortfolioPage,
  UpdatePortfolioInput,
} from '../../../../../packages/career-api-client/src/types';
import { careerApi } from '../../lib/career-api';
import { webOrigin } from '../../lib/career/portfolios';
import { useCareerAccess, useEntitled, useUid } from '../useCareer';

/**
 * Portfolio pages data. Keys start with ['career', uid]. The public page is
 * served by the website, so links and QR codes use the website origin
 * (EXPO_PUBLIC_APP_URL, already set in every EAS profile; EXPO_PUBLIC_WEB_URL overrides it).
 */

/** The website origin public pages are served from, or null when not configured. */
export const WEB_ORIGIN: string | null = webOrigin(process.env.EXPO_PUBLIC_WEB_URL ?? process.env.EXPO_PUBLIC_APP_URL);

export function usePortfolioGate(): 'loading' | 'locked' | 'off' | 'open' | 'error' {
  const access = useCareerAccess();
  if (access.isLoading) return 'loading';
  if (access.error || !access.data) return 'error';
  if (!access.data.enabled) return 'locked';
  if (access.data.features?.portfolioPages !== true) return 'off';
  return 'open';
}

export function usePortfolios() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'portfolios'], queryFn: () => careerApi.portfolios(), enabled: entitled, retry: false });
}

export function usePortfolio(id: string | undefined) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'portfolios', id],
    queryFn: () => careerApi.portfolio(id as string),
    enabled: entitled && Boolean(id),
    retry: false,
  });
}

/**
 * The QR SVG for the page's current link. Keyed by visibility and token so a
 * replaced private link never shows the old code.
 */
export function usePortfolioQr(page: PortfolioPage | undefined) {
  const { uid, entitled } = useEntitled();
  const published = Boolean(page && page.visibility !== 'draft');
  return useQuery({
    queryKey: ['career', uid, 'portfolios', page?.id, 'qr', page?.visibility, page?.shareToken ?? null, WEB_ORIGIN],
    queryFn: () => careerApi.portfolioQr(page!.id, WEB_ORIGIN as string),
    enabled: entitled && published && WEB_ORIGIN !== null,
    retry: false,
    staleTime: Infinity,
  });
}

export function usePortfolioActions() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const store = (page: PortfolioPage) => {
    queryClient.setQueryData(['career', uid, 'portfolios', page.id], page);
    void queryClient.invalidateQueries({ queryKey: ['career', uid, 'portfolios'], exact: true });
  };
  return {
    create: useMutation({ mutationFn: (input: CreatePortfolioInput) => careerApi.createPortfolio(input), onSuccess: store }),
    update: useMutation({
      mutationFn: (input: { id: string; body: UpdatePortfolioInput }) => careerApi.updatePortfolio(input.id, input.body),
      onSuccess: store,
    }),
    publish: useMutation({
      mutationFn: (input: { id: string; visibility: 'public' | 'private' }) => careerApi.publishPortfolio(input.id, input.visibility),
      onSuccess: store,
    }),
    unpublish: useMutation({ mutationFn: (id: string) => careerApi.unpublishPortfolio(id), onSuccess: store }),
    revoke: useMutation({ mutationFn: (id: string) => careerApi.revokePortfolio(id), onSuccess: store }),
  };
}
