import type { Metadata } from 'next';
import AdminShell from '@/components/admin/AdminShell';

// Server component so it can export `metadata`. The chrome — and every line of
// the sign-in redirect and the admin/super_admin role gate — lives in
// AdminShell, moved here unchanged on 2026-08-18.
//
// `noindex, follow: false` for the whole group. robots.txt does not Disallow
// these paths: a Disallow would prevent the fetch, so this directive would
// never be read. This is what removes them from an index.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
