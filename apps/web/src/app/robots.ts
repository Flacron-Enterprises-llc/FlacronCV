import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Replaces the former static public/robots.txt so the Sitemap URL follows
// NEXT_PUBLIC_SITE_URL instead of a hardcoded host.
//
// No Disallow list. Private groups (dashboard, CRM, admin) and the
// noindex auth/confirm pages carry `robots: { index: false }` in their
// layout metadata. A Disallow would stop the fetch, so a crawler would
// never read that directive — and dashboard/billing are linked from the
// public footer, so they will be discovered. /login and /register are
// meant to be indexed. The trailing-slash miss that used to leave /en/cv
// crawlable is therefore moot: crawl is allowed, de-indexing is the meta.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
