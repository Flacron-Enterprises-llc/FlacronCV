import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Replaces the former static public/robots.txt so the Sitemap URL follows
// NEXT_PUBLIC_SITE_URL instead of a hardcoded host.
//
// ── The trailing slashes used to make half of these rules miss ──────────────
// The patterns were `/*/cv/`, `/*/cover-letters/` and `/*/settings/`. A trailing
// slash means the rule only matches something BELOW the path, so `/en/cv/abc`
// was covered while `/en/cv` — the list page itself — was not. `/jobs` and
// `/support` had no rule at all. Verified against production on 2026-08-18:
// /en/cv, /en/cover-letters, /en/settings, /en/jobs and /en/support all
// answered 200 to an unauthenticated request, because the auth gate is
// client-side. Only /en/dashboard was actually disallowed.
//
// ⚠️ Disallow alone does NOT keep a URL out of the index, and it actively
// prevents the `noindex` meta from being read, because a crawler that will not
// fetch the page cannot see its directives. Those live in the (dashboard),
// (crm) and (admin) layouts as `robots: { index: false, follow: false }`, and
// they are what covers crawlers that fetch without consulting this file. If
// guaranteed de-indexing of these paths is ever required — they are reachable
// from the public footer, so they will be discovered — the correct move is to
// DROP them from this list so the meta directive becomes readable, not to add
// more rules here.
//
// The auth group (/login, /register, /forgot-password, /verify-email) is
// deliberately absent: /login and /register are meant to be indexed, and the
// other two carry `noindex, follow`, which only works if they can be fetched.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/*/dashboard',
        '/*/cv',
        '/*/cover-letters',
        '/*/settings',
        '/*/jobs',
        '/*/support',
        '/*/crm',
        '/*/admin',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
