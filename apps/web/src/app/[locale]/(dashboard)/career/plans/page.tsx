import { redirect } from '@/i18n/routing';

/**
 * Career plans are no longer a separate add-on: the five plans include the
 * career tools, and Settings → Billing is the single plan page. Old links,
 * bookmarks and emails pointing here land there.
 */
export default function Page({ params: { locale } }: { params: { locale: string } }) {
  redirect({ href: '/settings/billing', locale });
}
