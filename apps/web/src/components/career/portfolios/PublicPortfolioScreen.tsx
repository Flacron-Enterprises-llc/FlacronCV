'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createApiClient, isApiError, type PublicPortfolioView } from '@flacroncv/career-api-client';
import { Link } from '@/i18n/routing';
import { Badge, Button, Card, EmptyState, ProviderUnavailableState } from '@/components/career/ui';
import { careerApiOrigin } from '@/components/career/CareerServices';

const EVIDENCE_TYPES = new Set(['project', 'credential', 'work_sample', 'reference', 'publication']);
const EVIDENCE_LABELS = new Set([
  'self_reported',
  'evidence_attached',
  'assessment_completed',
  'issuer_verified',
  'reference_confirmed',
]);

/**
 * A person's published portfolio.
 *
 * The page is fetched on the server (see the route) so a missing slug is a
 * real 404 and a published page arrives fully rendered. `initial` is null
 * only when the career service could not be reached during that server
 * render; the visitor can then retry from the browser.
 */
export function PublicPortfolioScreen({
  slug,
  token,
  initial,
}: {
  slug: string;
  token: string | null;
  initial: PublicPortfolioView | null;
}) {
  const t = useTranslations('career.portfolios');
  const api = useMemo(() => createApiClient({ baseUrl: careerApiOrigin(), getToken: async () => null }), []);
  const [page, setPage] = useState<PublicPortfolioView | null>(initial);
  const [state, setState] = useState<'idle' | 'retrying' | 'missing'>('idle');

  const retry = useCallback(() => {
    setState('retrying');
    api
      .publicPortfolio(slug, token ?? undefined)
      .then((view) => {
        setPage(view);
        setState('idle');
      })
      .catch((error: unknown) => setState(isApiError(error, 'not_found') ? 'missing' : 'idle'));
  }, [api, slug, token]);

  if (!page) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-16">
        {state === 'missing' ? (
          <EmptyState title={t('public_missing_title')} body={t('public_missing_body')} />
        ) : (
          <ProviderUnavailableState
            title={t('public_unavailable_title')}
            body={t('public_unavailable_body')}
            action={
              <Button type="button" onClick={retry} disabled={state === 'retrying'}>
                {t('retry')}
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return <PortfolioPage page={page} />;
}

function PortfolioPage({ page }: { page: PublicPortfolioView }) {
  const t = useTranslations('career.portfolios');
  const tEvidence = useTranslations('career.evidence');
  const name = page.displayName || page.title;
  const hasContact = Boolean(page.contactEmail || page.contactPhone);

  return (
    <div className="bg-career-canvas">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:py-14">
        {/* Header: who this is and how to reach them. */}
        <header className="rounded-xl border border-career-line bg-career-surface p-6 shadow-sm sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-career-muted">{t('public_eyebrow')}</p>
          <h1 className="mt-2 text-3xl font-bold text-career-ink sm:text-4xl">{name}</h1>
          {page.headline ? <p className="mt-2 text-lg text-career-ink">{page.headline}</p> : null}
          {page.displayName && page.title && page.title !== page.displayName ? (
            <p className="mt-1 text-sm text-career-muted">{page.title}</p>
          ) : null}
          {hasContact ? (
            <dl className="mt-6 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-8">
              {page.contactEmail ? (
                <div className="flex gap-2">
                  <dt className="font-semibold text-career-ink">{t('public_email')}</dt>
                  <dd>
                    <a className="text-career-navy underline underline-offset-2" href={`mailto:${page.contactEmail}`}>
                      {page.contactEmail}
                    </a>
                  </dd>
                </div>
              ) : null}
              {page.contactPhone ? (
                <div className="flex gap-2">
                  <dt className="font-semibold text-career-ink">{t('public_phone')}</dt>
                  <dd>
                    <a className="text-career-navy underline underline-offset-2" href={`tel:${page.contactPhone.replace(/[^\d+]/g, '')}`}>
                      <span dir="ltr">{page.contactPhone}</span>
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </header>

        {/* The work the person chose to share. */}
        <section className="mt-10" aria-labelledby="portfolio-work">
          <h2 id="portfolio-work" className="text-xl font-semibold text-career-ink">
            {t('public_work_title')}
          </h2>
          {page.items.length === 0 ? (
            <p className="mt-4 text-sm text-career-muted">{t('public_work_empty')}</p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-4">
              {page.items.map((item) => (
                <li key={item.id}>
                  <Card>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="me-auto text-lg font-semibold text-career-ink">{item.title}</h3>
                      {EVIDENCE_TYPES.has(item.evidenceType) ? (
                        <Badge>{tEvidence(`type_${item.evidenceType}`)}</Badge>
                      ) : null}
                      {EVIDENCE_LABELS.has(item.evidenceLabel) ? (
                        <Badge tone="confirmed">{tEvidence(`label_${item.evidenceLabel}`)}</Badge>
                      ) : null}
                    </div>
                    {item.description ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-career-ink">{item.description}</p>
                    ) : null}
                    {item.caseStudy?.trim() ? (
                      <div className="mt-4 border-s-2 border-career-line ps-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-career-muted">{t('public_case_study')}</p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-career-ink">{item.caseStudy}</p>
                      </div>
                    ) : null}
                    {item.linkedSkills.length > 0 ? (
                      <div className="mt-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-career-muted">
                          {t('public_skills')}
                        </p>
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {item.linkedSkills.map((skill) => (
                            <li key={skill} className="rounded-full border border-career-line px-3 py-1 text-xs text-career-ink">
                              {skill}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Skills across the page, when the owner left that section on (the server also omits it). */}
        {page.sections?.skills !== false && (page.skills?.length ?? 0) > 0 ? (
          <section className="mt-10" aria-labelledby="portfolio-skills" data-testid="portfolio-skills">
            <h2 id="portfolio-skills" className="text-xl font-semibold text-career-ink">
              {t('public_skills')}
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {page.skills.map((skill) => (
                <li key={skill} className="rounded-full border border-career-line bg-career-surface px-3 py-1 text-sm text-career-ink">
                  {skill}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="mt-12 border-t border-career-line pt-6 text-center text-sm text-career-muted">
          {t.rich('public_made_with', {
            link: (chunks) => (
              <Link href="/" className="font-semibold text-career-navy underline-offset-2 hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </footer>
      </div>
    </div>
  );
}
