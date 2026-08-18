import type { Metadata } from 'next';
import DashboardShell from '@/components/dashboard/DashboardShell';

// Server component so it can export `metadata`. The chrome — and every line of
// the auth redirect — lives in DashboardShell, which is where this file's body
// moved on 2026-08-18, unchanged.
//
// `noindex, nofollow` for the whole group. These URLs are reachable from the
// public footer's Account column, so they will be discovered. robots.txt does
// not Disallow them: a Disallow would prevent the fetch, so this directive
// would never be read. `follow: false` too — there is nothing inside the app a
// crawler should walk into, unlike /forgot-password which keeps `follow: true`
// because it sits among pages we do want indexed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
