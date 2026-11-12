import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { careerApi } from '../../lib/career-api';
import { useEntitled, useUid } from '../useCareer';
import type { AlertList, AlertSettings, SavedSearch } from '../../../../../packages/career-api-client/src/types';

/**
 * Alerts, saved searches, alert locations and followed companies. Every key
 * starts with ['career', uid] so a second account on the device never sees
 * the first one's cache. Each list loads on its own: a failure in one must not
 * hide the others (same as the website's alert centre).
 */

export function useAlertList() {
  const { uid, entitled } = useEntitled();
  return useQuery({ queryKey: ['career', uid, 'alerts'], queryFn: () => careerApi.alerts(), enabled: entitled });
}

export function useSavedSearches(enabled = true) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'saved-searches'],
    queryFn: async () => (await careerApi.savedSearches()).items,
    enabled: entitled && enabled,
  });
}

export function useAlertLocations(enabled = true) {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'alert-locations'],
    queryFn: async () => (await careerApi.alertLocations()).items,
    enabled: entitled && enabled,
  });
}

export function useFollowedCompanies() {
  const { uid, entitled } = useEntitled();
  return useQuery({
    queryKey: ['career', uid, 'followed-companies'],
    queryFn: async () => (await careerApi.followedCompanies()).items,
    enabled: entitled,
  });
}

export function useAlertActions() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const refresh = (what: string) => queryClient.invalidateQueries({ queryKey: ['career', uid, what] });
  return {
    saveSettings: useMutation({
      mutationFn: (patch: AlertSettings) => careerApi.updateAlertSettings(patch),
      onSuccess: (settings) => {
        queryClient.setQueryData<AlertList>(['career', uid, 'alerts'], (current) => (current ? { ...current, settings } : current));
      },
    }),
    createSearch: useMutation({
      mutationFn: (input: { q: string; schedule?: SavedSearch['schedule']; locationProfileId?: string }) => careerApi.createSavedSearch(input),
      onSuccess: () => void refresh('saved-searches'),
    }),
    updateSearch: useMutation({
      mutationFn: (input: { id: string; patch: { paused?: boolean; schedule?: SavedSearch['schedule'] } }) =>
        careerApi.updateSavedSearch(input.id, input.patch),
      onSuccess: (next) => {
        queryClient.setQueryData<SavedSearch[]>(['career', uid, 'saved-searches'], (current) =>
          current ? current.map((s) => (s.id === next.id ? next : s)) : current,
        );
      },
    }),
    deleteSearch: useMutation({
      mutationFn: (id: string) => careerApi.deleteSavedSearch(id),
      onSuccess: () => void refresh('saved-searches'),
    }),
    createLocation: useMutation({
      mutationFn: (input: { place: string; radiusMiles: number }) => careerApi.createAlertLocation(input),
      onSuccess: () => void refresh('alert-locations'),
    }),
    updateLocation: useMutation({
      mutationFn: (input: { id: string; place: string; radiusMiles: number }) =>
        careerApi.updateAlertLocation(input.id, { place: input.place, radiusMiles: input.radiusMiles }),
      onSuccess: () => void refresh('alert-locations'),
    }),
    deleteLocation: useMutation({
      mutationFn: (id: string) => careerApi.deleteAlertLocation(id),
      onSuccess: () => {
        void refresh('alert-locations');
        // A saved search may have pointed at this location.
        void refresh('saved-searches');
      },
    }),
    follow: useMutation({
      mutationFn: (input: { name: string; sourceUrl?: string }) => careerApi.followCompany(input),
      onSuccess: () => void refresh('followed-companies'),
    }),
    unfollow: useMutation({
      mutationFn: (id: string) => careerApi.unfollowCompany(id),
      onSuccess: () => void refresh('followed-companies'),
    }),
  };
}
