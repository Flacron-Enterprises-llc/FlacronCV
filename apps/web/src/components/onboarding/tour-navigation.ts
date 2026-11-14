import { pathsMatch } from '@/lib/app-tour';

/**
 * The page the tour automatically starts on. A tour that starts itself must
 * never pull the user away from wherever they chose to go — so it starts only
 * when they are already here. (Replay from Settings is a request to be taken
 * through the tour, so it may navigate.)
 */
export const TOUR_HOME_PATH = '/dashboard';

export function canAutoStartTourOn(pathname: string): boolean {
  return pathsMatch(pathname, TOUR_HOME_PATH);
}

/**
 * Whether the user has left the tour: a tour is running (`tourPath` is the
 * path it is on, or navigating to) and the current path is somewhere else.
 * The tour only ever moves between paths it set itself, so any other path is
 * the user's own navigation (sidebar, URL, back button), and the tour must
 * step aside rather than send them back.
 */
export function userLeftTour(tourPath: string | null, pathname: string): boolean {
  return tourPath !== null && !pathsMatch(pathname, tourPath);
}
