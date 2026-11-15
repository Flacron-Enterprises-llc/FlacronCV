import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { careerApi } from '../../lib/career-api';
import { markedRead } from '../../lib/career/reminders';
import { trackerReminders } from '../../lib/job-from-opportunity';
import type { JobApplication } from '../../types/job.types';
import { useEntitled, useUid } from '../useCareer';
import type { AlertList, AlertSettings, ReminderList, SavedSearch, SavedSearchInput } from '../../../../../packages/career-api-client/src/types';

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

/**
 * Career reminders. Tracker follow-up and interview dates are pushed first
 * (`POST /reminders/tracker-sync`, best effort: the tracker is another
 * service), then the list is read. Reminders never use alert items.
 */
export function useReminders(enabled = true) {
  const { uid, entitled } = useEntitled();
  return useQuery<ReminderList>({
    queryKey: ['career', uid, 'reminders'],
    queryFn: async () => {
      try {
        const items = trackerReminders(await api.get<JobApplication[]>('/jobs'));
        if (items.length > 0) await careerApi.syncTrackerReminders(items);
      } catch {
        // Shown again after the next successful sync.
      }
      return careerApi.reminders();
    },
    enabled: entitled && enabled,
    retry: false,
  });
}

export function useMarkReminderRead() {
  const queryClient = useQueryClient();
  const uid = useUid();
  return useMutation({
    mutationFn: (reminderId: string) => careerApi.markReminderRead(reminderId),
    onSuccess: (_result, reminderId) => {
      queryClient.setQueryData<ReminderList>(['career', uid, 'reminders'], (current) => (current ? markedRead(current, reminderId) : current));
    },
  });
}

export function useAlertActions() {
  const queryClient = useQueryClient();
  const uid = useUid();
  const refresh = (what: string) => queryClient.invalidateQueries({ queryKey: ['career', uid, what] });
  return {
    // Marking read only changes the badge; a failure is harmless and the next load shows the server's state.
    markRead: useMutation({
      mutationFn: (alertId: string) => careerApi.markAlertRead(alertId),
      onSuccess: () => void refresh('alerts'),
    }),
    markAllRead: useMutation({
      mutationFn: () => careerApi.markAllAlertsRead(),
      onSuccess: () => void refresh('alerts'),
    }),
    saveSettings: useMutation({
      mutationFn: (patch: AlertSettings) => careerApi.updateAlertSettings(patch),
      onSuccess: (settings) => {
        queryClient.setQueryData<AlertList>(['career', uid, 'alerts'], (current) => (current ? { ...current, settings } : current));
      },
    }),
    createSearch: useMutation({
      mutationFn: (input: SavedSearchInput) => careerApi.createSavedSearch(input),
      onSuccess: () => void refresh('saved-searches'),
    }),
    updateSearch: useMutation({
      mutationFn: (input: { id: string; patch: { paused?: boolean; schedule?: SavedSearch['schedule']; relevance?: SavedSearchInput['relevance'] } }) =>
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
      mutationFn: (input: { name: string; sourceUrl?: string; aliases?: string[]; roles?: string[]; locations?: string[] }) =>
        careerApi.followCompany(input),
      onSuccess: () => void refresh('followed-companies'),
    }),
    /** Name, aliases, roles and places of a followed company (PATCH /followed-companies/:id). */
    updateCompany: useMutation({
      mutationFn: (input: { id: string; patch: { name?: string; aliases?: string[]; roles?: string[]; locations?: string[] } }) =>
        careerApi.updateFollowedCompany(input.id, input.patch),
      onSuccess: () => void refresh('followed-companies'),
    }),
    unfollow: useMutation({
      mutationFn: (id: string) => careerApi.unfollowCompany(id),
      onSuccess: () => void refresh('followed-companies'),
    }),
  };
}
