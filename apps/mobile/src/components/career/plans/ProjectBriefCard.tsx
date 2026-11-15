import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { SkillGapReport } from '../../../../../../packages/career-api-client/src/types';
import { useEvidenceList } from '../../../hooks/career/evidence';
import { useAddProjectToEvidence, useSaveRubricCheck, useSetProjectOwnership } from '../../../hooks/career/learning';
import { useT } from '../../../i18n';
import {
  canSaveOwnership,
  evidenceErrorMessage,
  initialCriteria,
  OWNERSHIP_MAX,
  RUBRIC_NOTE_MAX,
  rubricCheckInput,
  rubricStatusLine,
  rubricWeight,
  savedOwnership,
  toggleId,
  type CriterionDraft,
} from '../../../lib/career/learning';
import { careerErrorMessage, formatDay } from '../../../lib/career-view';
import { Pill } from '../CareerHeader';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { CheckRow, Note } from './PlanBits';

type Brief = NonNullable<SkillGapReport['projectBrief']>;

/**
 * The project brief of a learning plan (website ProjectBriefPanel): what to
 * build, the steps and tools, the rubric, the person's own ownership
 * statement, adding the finished project to the evidence vault, and a rubric
 * self-check that points at the delivered evidence. All free. The brief is
 * marked as AI-assisted; the self-check is never an independent assessment.
 */
export function ProjectBriefCard({ report }: { report: SkillGapReport }) {
  const t = useT('careerPlans.brief');
  const brief = report.projectBrief as Brief;
  const setOwnership = useSetProjectOwnership(report.id);
  const addProject = useAddProjectToEvidence(report.id);
  const saveCheck = useSaveRubricCheck(report.id);
  const hasOwnership = savedOwnership(brief).length > 0;
  const evidence = useEvidenceList();
  const [ownership, setOwnershipDraft] = useState(savedOwnership(brief));
  const [selected, setSelected] = useState<string[]>(brief.rubricCheck?.evidenceIds ?? []);
  const [criteria, setCriteria] = useState<Record<string, CriterionDraft>>(() => initialCriteria(brief));
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // A reloaded or different report resets the drafts to what is saved.
  useEffect(() => {
    setOwnershipDraft(brief.ownershipStatement ?? '');
    setSelected(brief.rubricCheck?.evidenceIds ?? []);
    setCriteria(initialCriteria(brief));
    // Only the saved values matter; adding the vault item must not reset the drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id, brief.ownershipStatement, brief.rubricCheck]);

  const busy = setOwnership.isPending || addProject.isPending || saveCheck.isPending;

  const onSaveOwnership = () => {
    setNote(null);
    setOwnership.mutate(ownership.trim(), {
      onSuccess: () => setNote({ tone: 'success', text: t('ownership_saved') }),
      onError: (error) => setNote({ tone: 'error', text: careerErrorMessage(error, t('ownership_failed')) }),
    });
  };

  const onAddProject = () => {
    setNote(null);
    addProject.mutate(undefined, {
      onSuccess: (result) => {
        setSelected((prev) => (prev.includes(result.evidenceId) ? prev : [...prev, result.evidenceId]));
        setNote({ tone: 'success', text: result.created ? t('project_added') : t('project_already_added') });
      },
      onError: (error) => setNote({ tone: 'error', text: evidenceErrorMessage(error) }),
    });
  };

  const onSaveCheck = () => {
    setNote(null);
    saveCheck.mutate(rubricCheckInput(brief, criteria, selected), {
      onSuccess: () => setNote({ tone: 'success', text: t('rubric_check_saved') }),
      onError: (error) => setNote({ tone: 'error', text: careerErrorMessage(error, t('rubric_check_failed')) }),
    });
  };

  const check = brief.rubricCheck;
  const items = evidence.data?.items ?? [];

  return (
    <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
      <View className="flex-row flex-wrap items-center gap-2">
        <Text className="flex-1 text-base font-bold text-stone-900" accessibilityRole="header">
          {brief.title}
        </Text>
        <Pill label={t('ai_assisted_brief')} tone="brand" />
      </View>
      <Text className="text-sm text-stone-700 mt-1 leading-5">{brief.summary}</Text>
      <Text className="text-xs text-stone-400 mt-1">{`${t('estimated_project_effort')}: ${t('hours_count', { count: brief.estimatedHours })}`}</Text>
      <Text className="text-xs text-stone-500 mt-1 leading-4">{t('ai_assisted_hint')}</Text>

      <List title={t('project_requirements')} items={brief.requirements} />
      <List title={t('project_deliverables')} items={brief.deliverables} />
      {brief.steps && brief.steps.length > 0 ? <List title={t('project_steps')} items={brief.steps} ordered /> : null}
      {brief.tools && brief.tools.length > 0 ? <List title={t('project_tools')} items={brief.tools} /> : null}

      <Label>{t('evaluation_rubrics')}</Label>
      {brief.rubrics.map((rubric) => (
        <View key={rubric.id} className="border-t border-stone-100 py-2 flex-row">
          <View className="flex-1 me-2">
            <Text className="text-sm font-semibold text-stone-900">{rubric.name}</Text>
            <Text className="text-xs text-stone-500 mt-0.5 leading-4">{rubric.description}</Text>
          </View>
          <Text className="text-sm font-bold text-brand-700" accessibilityLabel={`${t('rubric_weight')}: ${rubricWeight(rubric.weight)}`}>
            {rubricWeight(rubric.weight)}
          </Text>
        </View>
      ))}

      <View className="border-t border-stone-200 mt-4 pt-4">
        <Text className="text-sm font-semibold text-stone-900">{t('ownership_label')}</Text>
        <Text className="text-xs text-stone-500 mt-0.5 mb-2 leading-4">{t('ownership_hint')}</Text>
        <Input
          accessibilityLabel={t('ownership_label')}
          value={ownership}
          onChangeText={setOwnershipDraft}
          maxLength={OWNERSHIP_MAX}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 80 }}
          editable={!busy}
        />
        <View className="gap-2">
          <Button variant="outline" onPress={onSaveOwnership} loading={setOwnership.isPending} disabled={busy || !canSaveOwnership(ownership, brief)} fullWidth>
            {t('ownership_save')}
          </Button>
          <Button onPress={onAddProject} loading={addProject.isPending} disabled={busy || !hasOwnership} fullWidth>
            {brief.evidenceId ? t('project_in_vault') : t('project_add_to_vault')}
          </Button>
        </View>
        {!hasOwnership ? <Text className="text-xs text-stone-500 mt-2 leading-4">{t('ownership_needed')}</Text> : null}
      </View>

      {hasOwnership ? (
        <View className="border-t border-stone-200 mt-4 pt-4">
          <Text className="text-sm font-semibold text-stone-900" accessibilityRole="header">
            {t('rubric_check_title')}
          </Text>
          <Text className="text-xs text-stone-500 mt-0.5 mb-2 leading-4">{t('rubric_check_hint')}</Text>
          {check ? <Note tone="info" text={rubricStatusLine(check, formatDay(check.checkedAt) ?? check.checkedAt.slice(0, 10))} /> : null}
          <Label>{t('rubric_check_evidence')}</Label>
          {evidence.isLoading ? (
            <Text className="text-xs text-stone-500">{t('loading')}</Text>
          ) : evidence.error ? (
            <Text className="text-xs text-red-700">{t('evidence_list_failed')}</Text>
          ) : items.length === 0 ? (
            <Text className="text-xs text-stone-500">{t('rubric_check_no_evidence')}</Text>
          ) : (
            items.map((item) => (
              <CheckRow key={item.id} label={item.title} checked={selected.includes(item.id)} onToggle={() => setSelected((prev) => toggleId(prev, item.id))} disabled={busy} />
            ))
          )}
          {brief.rubrics.map((rubric) => {
            const draft = criteria[rubric.id] ?? { met: false, note: '' };
            return (
              <View key={rubric.id} className="border border-stone-200 rounded-xl p-3 mt-3">
                <CheckRow
                  label={t('rubric_check_met', { name: rubric.name })}
                  checked={draft.met}
                  onToggle={() => setCriteria((prev) => ({ ...prev, [rubric.id]: { ...draft, met: !draft.met } }))}
                  disabled={busy}
                />
                <Input
                  label={t('rubric_check_note')}
                  value={draft.note}
                  onChangeText={(text) => setCriteria((prev) => ({ ...prev, [rubric.id]: { ...draft, note: text } }))}
                  maxLength={RUBRIC_NOTE_MAX}
                  editable={!busy}
                />
              </View>
            );
          })}
          <View className="mt-3">
            <Button onPress={onSaveCheck} loading={saveCheck.isPending} disabled={busy || selected.length === 0} fullWidth>
              {t('rubric_check_save')}
            </Button>
          </View>
        </View>
      ) : null}

      {note ? (
        <View className="mt-4">
          <Note tone={note.tone} text={note.text} />
        </View>
      ) : null}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide mt-4 mb-1.5">{children}</Text>;
}

function List({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  return (
    <>
      <Label>{title}</Label>
      {items.map((item, i) => (
        <View key={i} className="flex-row items-start mb-1">
          <Text className="text-stone-400 text-sm w-6">{ordered ? `${i + 1}.` : '•'}</Text>
          <Text className="flex-1 text-stone-700 text-sm leading-5">{item}</Text>
        </View>
      ))}
    </>
  );
}
