import type { Metadata } from 'next';
import CRMShell from '@/components/crm/CRMShell';

// Server component so it can export `metadata`. The chrome — and every line of
// the sign-in redirect and the admin/super_admin role gate — lives in
// CRMShell, moved here unchanged on 2026-08-18.
//
// `noindex, follow: false` for the whole group. robots.txt already disallows
// these paths, but a Disallow only stops the fetch; it does not stop a URL
// being indexed with no content. This directive is what removes them from an
// index, and it covers any crawler that fetches without reading robots.txt.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function CRMLayout({ children }: { children: React.ReactNode }) {
  return <CRMShell>{children}</CRMShell>;
}
