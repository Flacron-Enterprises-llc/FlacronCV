/**
 * The listing a career page was opened for (`?opportunityId=`), e.g. from an
 * alert's "Build an action pack" link. Read once on mount to preselect the
 * listing; the server still checks the listing belongs to the caller.
 */
export function opportunityIdFromUrl(): string {
  if (typeof window === 'undefined') return '';
  const value = new URLSearchParams(window.location.search).get('opportunityId') ?? '';
  return /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : '';
}
