/**
 * Build-time switch for the career integration, readable from any module.
 *
 * Same rule as `isCareerEnabled()` in components/career/CareerServices, which
 * is a client module: a server component cannot call a function exported from
 * a 'use client' file, and public pages should not pull the career API client
 * into their bundle just to read one environment variable.
 */
export function careerBuildEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CAREER_ENABLED?.trim() === 'true';
}
