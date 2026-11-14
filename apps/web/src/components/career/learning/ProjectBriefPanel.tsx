'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { isApiError, type ApiClient, type CareerEvidence, type SkillGapReport } from '@flacroncv/career-api-client';
import { Badge, Button, Card, InlineNote } from '@/components/career/ui';

type Brief = NonNullable<SkillGapReport['projectBrief']>;

interface CriterionDraft {
  met: boolean;
  note: string;
}

/**
 * The project brief, the person's own ownership statement, adding the
 * finished project to the Evidence Vault, and a rubric self-check that
 * references the delivered evidence. All free: the brief came with the report.
 */
export function ProjectBriefPanel({
  api,
  report,
  onReport,
}: {
  api: ApiClient;
  report: SkillGapReport;
  onReport: (next: SkillGapReport) => void;
}) {
  const t = useTranslations('career.learning');
  const locale = useLocale();
  const brief = report.projectBrief as Brief;
  const [ownership, setOwnership] = useState(brief.ownershipStatement ?? '');
  const [savingOwnership, setSavingOwnership] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [evidence, setEvidence] = useState<CareerEvidence[] | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>(brief.rubricCheck?.evidenceIds ?? []);
  const [criteria, setCriteria] = useState<Record<string, CriterionDraft>>(() => initialCriteria(brief));
  const [savingCheck, setSavingCheck] = useState(false);
  const [note, setNote] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null);

  // A different report (or a reloaded one) resets the drafts to what is saved.
  useEffect(() => {
    setOwnership(brief.ownershipStatement ?? '');
    setSelectedEvidence(brief.rubricCheck?.evidenceIds ?? []);
    setCriteria(initialCriteria(brief));
    // Only the saved values matter here; adding the vault item must not reset the drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, brief.ownershipStatement, brief.rubricCheck]);

  const savedOwnership = brief.ownershipStatement ?? '';
  const hasOwnership = savedOwnership.length > 0;

  const loadEvidence = async () => {
    try {
      const list = await api.evidence();
      setEvidence(list.items);
    } catch {
      setEvidence([]);
      setNote({ tone: 'error', text: t('evidence_list_failed') });
    }
  };

  useEffect(() => {
    if (hasOwnership && evidence === null) void loadEvidence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOwnership]);

  const saveOwnership = async () => {
    if (!ownership.trim()) return;
    setSavingOwnership(true);
    setNote(null);
    try {
      onReport(await api.setProjectOwnership(report.id, ownership.trim()));
      setNote({ tone: 'success', text: t('ownership_saved') });
    } catch {
      setNote({ tone: 'error', text: t('ownership_failed') });
    } finally {
      setSavingOwnership(false);
    }
  };

  const addProject = async () => {
    setAddingProject(true);
    setNote(null);
    try {
      const res = await api.addProjectToEvidence(report.id);
      onReport({ ...report, projectBrief: { ...brief, evidenceId: res.evidenceId } });
      setSelectedEvidence((prev) => (prev.includes(res.evidenceId) ? prev : [...prev, res.evidenceId]));
      setNote({ tone: 'success', text: res.created ? t('project_added') : t('project_already_added') });
      await loadEvidence();
    } catch (error) {
      setNote({ tone: 'error', text: evidenceErrorText(error, t) });
    } finally {
      setAddingProject(false);
    }
  };

  const saveCheck = async () => {
    setSavingCheck(true);
    setNote(null);
    try {
      const next = await api.saveRubricCheck(report.id, {
        evidenceIds: selectedEvidence,
        criteria: brief.rubrics.map((rubric) => ({
          criterionId: rubric.id,
          met: criteria[rubric.id]?.met ?? false,
          note: criteria[rubric.id]?.note ?? '',
        })),
      });
      onReport(next);
      setNote({ tone: 'success', text: t('rubric_check_saved') });
    } catch {
      setNote({ tone: 'error', text: t('rubric_check_failed') });
    } finally {
      setSavingCheck(false);
    }
  };

  const check = brief.rubricCheck;

  return (
    <Card className="p-6">
      <div className="border-b border-career-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold text-career-ink" dir="auto">{brief.title}</h3>
          <Badge tone="neutral">{t('ai_assisted_brief')}</Badge>
        </div>
        <p className="mt-1 text-xs text-career-ink/80" dir="auto">{brief.summary}</p>
        <p className="mt-1 text-xs text-career-muted">
          {t('estimated_project_effort')}: {t('hours_count', { count: brief.estimatedHours })}
        </p>
        <p className="mt-1 text-xs text-career-muted">{t('ai_assisted_hint')}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <BriefList title={t('project_requirements')} items={brief.requirements} />
        <BriefList title={t('project_deliverables')} items={brief.deliverables} />
        {brief.steps && brief.steps.length > 0 ? <BriefList title={t('project_steps')} items={brief.steps} ordered /> : null}
        {brief.tools && brief.tools.length > 0 ? <BriefList title={t('project_tools')} items={brief.tools} /> : null}
      </div>

      <div className="mt-6">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-career-muted">{t('evaluation_rubrics')}</h4>
        <div className="overflow-x-auto rounded-md border border-career-line">
          <table className="min-w-full divide-y divide-career-line text-start text-xs">
            <thead className="bg-career-wash/50 font-semibold text-career-ink">
              <tr>
                <th className="px-3 py-2 text-start">{t('rubric_name')}</th>
                <th className="px-3 py-2 text-start">{t('rubric_description')}</th>
                <th className="px-3 py-2 text-end">{t('rubric_weight')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-career-line bg-career-surface">
              {brief.rubrics.map((rubric) => (
                <tr key={rubric.id}>
                  <td className="px-3 py-2 font-medium text-career-ink" dir="auto">{rubric.name}</td>
                  <td className="px-3 py-2 text-career-muted" dir="auto">{rubric.description}</td>
                  <td className="px-3 py-2 text-end font-semibold text-career-navy">
                    {new Intl.NumberFormat(locale, { style: 'percent' }).format(rubric.weight / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ownership: the person's words only; nothing is prefilled. */}
      <div className="mt-6 space-y-2 border-t border-career-line pt-4">
        <label htmlFor={`ownership-${report.id}`} className="block text-sm font-semibold text-career-ink">
          {t('ownership_label')}
        </label>
        <p className="text-xs text-career-muted">{t('ownership_hint')}</p>
        <textarea
          id={`ownership-${report.id}`}
          value={ownership}
          maxLength={2000}
          rows={3}
          dir="auto"
          onChange={(e) => setOwnership(e.target.value)}
          className="w-full rounded-md border border-career-line bg-career-surface px-3 py-2 text-sm text-career-ink focus:border-career-navy focus:outline-none dark:focus:border-career-orange"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void saveOwnership()}
            disabled={savingOwnership || !ownership.trim() || ownership.trim() === savedOwnership}
          >
            {savingOwnership ? t('saving') : t('ownership_save')}
          </Button>
          <Button type="button" onClick={() => void addProject()} disabled={!hasOwnership || addingProject}>
            {addingProject ? t('saving_evidence') : brief.evidenceId ? t('project_in_vault') : t('project_add_to_vault')}
          </Button>
        </div>
        {!hasOwnership ? <p className="text-xs text-career-muted">{t('ownership_needed')}</p> : null}
      </div>

      {/* Rubric self-check against delivered evidence. */}
      {hasOwnership ? (
        <div className="mt-6 space-y-3 border-t border-career-line pt-4">
          <div>
            <h4 className="text-sm font-semibold text-career-ink">{t('rubric_check_title')}</h4>
            <p className="text-xs text-career-muted">{t('rubric_check_hint')}</p>
          </div>
          {check ? (
            <InlineNote tone="info">
              {t('rubric_check_status', {
                met: check.criteria.filter((c) => c.met).length,
                total: check.criteria.length,
                date: new Date(check.checkedAt).toLocaleDateString(locale),
              })}
            </InlineNote>
          ) : null}

          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold uppercase tracking-wider text-career-muted">{t('rubric_check_evidence')}</legend>
            {evidence === null ? (
              <p className="text-xs text-career-muted">{t('loading')}</p>
            ) : evidence.length === 0 ? (
              <p className="text-xs text-career-muted">{t('rubric_check_no_evidence')}</p>
            ) : (
              evidence.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-xs text-career-ink">
                  <input
                    type="checkbox"
                    checked={selectedEvidence.includes(item.id)}
                    onChange={(e) =>
                      setSelectedEvidence((prev) => (e.target.checked ? [...prev, item.id] : prev.filter((x) => x !== item.id)))
                    }
                    className="h-4 w-4 rounded border-career-line"
                  />
                  <span dir="auto">{item.title}</span>
                </label>
              ))
            )}
          </fieldset>

          <div className="space-y-3">
            {brief.rubrics.map((rubric) => {
              const draft = criteria[rubric.id] ?? { met: false, note: '' };
              return (
                <div key={rubric.id} className="rounded-md border border-career-line p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-career-ink">
                    <input
                      type="checkbox"
                      checked={draft.met}
                      onChange={(e) => setCriteria((prev) => ({ ...prev, [rubric.id]: { ...draft, met: e.target.checked } }))}
                      className="h-4 w-4 rounded border-career-line"
                    />
                    <span dir="auto">{t('rubric_check_met', { name: rubric.name })}</span>
                  </label>
                  <label className="mt-2 block text-xs text-career-muted" htmlFor={`rubric-note-${rubric.id}`}>
                    {t('rubric_check_note')}
                  </label>
                  <input
                    id={`rubric-note-${rubric.id}`}
                    type="text"
                    maxLength={1000}
                    value={draft.note}
                    dir="auto"
                    onChange={(e) => setCriteria((prev) => ({ ...prev, [rubric.id]: { ...draft, note: e.target.value } }))}
                    className="mt-1 w-full rounded-md border border-career-line bg-career-surface px-3 py-1.5 text-xs text-career-ink"
                  />
                </div>
              );
            })}
          </div>
          <Button type="button" onClick={() => void saveCheck()} disabled={savingCheck || selectedEvidence.length === 0}>
            {savingCheck ? t('saving') : t('rubric_check_save')}
          </Button>
        </div>
      ) : null}

      {note ? (
        <InlineNote tone={note.tone} className="mt-4">
          {note.text}
        </InlineNote>
      ) : null}
    </Card>
  );
}

function initialCriteria(brief: Brief): Record<string, CriterionDraft> {
  const out: Record<string, CriterionDraft> = {};
  for (const rubric of brief.rubrics) {
    const saved = brief.rubricCheck?.criteria.find((c) => c.criterionId === rubric.id);
    out[rubric.id] = { met: saved?.met ?? false, note: saved?.note ?? '' };
  }
  return out;
}

function BriefList({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  const List = ordered ? 'ol' : 'ul';
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-career-muted">{title}</h4>
      <List className={`mt-2 space-y-1 ps-4 text-xs text-career-ink/90 ${ordered ? 'list-decimal' : 'list-disc'}`}>
        {items.map((item, i) => (
          <li key={i} dir="auto">
            {item}
          </li>
        ))}
      </List>
    </div>
  );
}

/** Shared by the milestone and project vault actions. */
export function evidenceErrorText(error: unknown, t: (key: string) => string): string {
  if (isApiError(error, 'capacity_exceeded')) return t('evidence_capacity_exceeded');
  if (isApiError(error, 'feature_unavailable')) return t('evidence_feature_unavailable');
  if (isApiError(error, 'plan_upgrade_required')) return t('evidence_plan_upgrade');
  return t('evidence_convert_failed');
}
