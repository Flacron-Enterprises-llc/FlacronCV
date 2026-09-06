import { notFound } from 'next/navigation';
import CaptureClient from './CaptureClient';

/**
 * Copied into a gitignored App Router folder by `run.mjs` for local stills
 * only. Must never be committed under `src/app` — Amplify `next build`
 * would then ship the route.
 *
 * Belt: even if the copy is left behind, `next start` / Amplify run with
 * NODE_ENV=production and this 404s. Local capture uses `next dev`.
 */
export const dynamic = 'force-dynamic';
export const robots = { index: false, follow: false };

export default function TemplateCapturePage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <CaptureClient templateId={searchParams.id || 'modern'} />;
}
