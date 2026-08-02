import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Replaces the former static public/robots.txt so the Sitemap URL follows
// NEXT_PUBLIC_SITE_URL instead of a hardcoded host.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/*/dashboard',
        '/*/cv/',
        '/*/cover-letters/',
        '/*/settings/',
        '/*/crm/',
        '/*/admin/',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
