import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { ActionPack, ActionPackEdit } from '../../../../../../packages/career-api-client/src/types';
import { useT } from '../../../i18n';
import {
  canAddChecklistRow,
  checklistEdit,
  checklistRows,
  factsToAddBack,
  fitEdit,
  letterEdit,
  moveRow,
  nextStepsEdit,
  PACK_LIMITS,
  resumeEdit,
  resumeRows,
  type ChecklistRow,
  type ResumeRow,
} from '../../../lib/career/action-packs';
import { FACT_TYPE_LABEL } from '../../../lib/career-view';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';

/**
 * The website's ActionPackEditors on a phone: each component of a pack edited
 * in place. Text is the person's to write; a résumé line can only stand for a
 * confirmed fact frozen in the pack. Saving is free.
 */

interface EditorProps {
  saving: boolean;
  onSave: (edit: ActionPackEdit) => void;
  onCancel: () => void;
}

function Actions({ saving, onSave, onCancel, disabled }: { saving: boolean; onSave: () => void; onCancel: () => void; disabled?: boolean }) {
  const t = useT('careerPlans.pack');
  return (
    <View className="flex-row gap-2 mt-1">
      <View className="flex-1">
        <Button variant="outline" fullWidth onPress={onCancel} disabled={saving}>
          {t('cancel')}
        </Button>
      </View>
      <View className="flex-1">
        <Button fullWidth onPress={onSave} loading={saving} disabled={disabled}>
          {t('save')}
        </Button>
      </View>
    </View>
  );
}

const multiline = { multiline: true, textAlignVertical: 'top' as const };

export function FitEditor({ reasons, gaps, saving, onSave, onCancel }: EditorProps & { reasons: string[]; gaps: string[] }) {
  const t = useT('careerPlans.pack');
  const [reasonText, setReasonText] = useState(reasons.join('\n'));
  const [gapText, setGapText] = useState(gaps.join('\n'));
  return (
    <View className="mt-3">
      <Text className="text-xs text-stone-500 mb-2">{t('edit_one_per_line')}</Text>
      <Input label={t('fit_reasons')} value={reasonText} onChangeText={setReasonText} {...multiline} style={{ minHeight: 96 }} editable={!saving} />
      <Input label={t('skill_gaps')} value={gapText} onChangeText={setGapText} {...multiline} style={{ minHeight: 96 }} editable={!saving} />
      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(fitEdit(reasonText, gapText))} />
    </View>
  );
}

export function ResumeEditor({ pack, saving, onSave, onCancel }: EditorProps & { pack: ActionPack }) {
  const t = useT('careerPlans.pack');
  const [title, setTitle] = useState(pack.tailoredResume.title);
  const [rows, setRows] = useState<ResumeRow[]>(() => resumeRows(pack));
  const available = factsToAddBack(pack, rows);
  const invalid = title.trim() === '' || rows.length === 0 || rows.some((row) => row.text.trim() === '');
  return (
    <View className="mt-3">
      <Input label={t('resume_title_label')} value={title} onChangeText={setTitle} maxLength={PACK_LIMITS.title} editable={!saving} />
      {rows.map((row, index) => (
        <View key={row.factId} className="border border-stone-200 rounded-xl p-3 mb-3">
          <Text className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1">{FACT_TYPE_LABEL[row.factType] ?? row.factType}</Text>
          <Input
            accessibilityLabel={t('resume_line_label')}
            value={row.text}
            onChangeText={(text) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, text } : r)))}
            maxLength={PACK_LIMITS.lineText}
            {...multiline}
            style={{ minHeight: 60 }}
            editable={!saving}
          />
          <View className="flex-row flex-wrap gap-2 -mt-2">
            <Button size="sm" variant="ghost" onPress={() => setRows((prev) => moveRow(prev, index, -1))} disabled={saving || index === 0}>
              {t('move_up')}
            </Button>
            <Button size="sm" variant="ghost" onPress={() => setRows((prev) => moveRow(prev, index, 1))} disabled={saving || index === rows.length - 1}>
              {t('move_down')}
            </Button>
            <Button size="sm" variant="ghost" onPress={() => setRows((prev) => prev.filter((_, i) => i !== index))} disabled={saving || rows.length === 1}>
              {t('remove_line')}
            </Button>
          </View>
        </View>
      ))}
      {available.length > 0 ? (
        <View className="mb-3">
          <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">{t('add_back_heading')}</Text>
          {available.map((fact) => (
            <View key={fact.factId} className="flex-row items-center border-b border-stone-100 py-2">
              <Text className="flex-1 text-sm text-stone-800 me-2">{fact.text}</Text>
              <Button size="sm" variant="outline" onPress={() => setRows((prev) => [...prev, fact])} disabled={saving} accessibilityLabel={`${t('add_back')}: ${fact.text}`}>
                {t('add_back')}
              </Button>
            </View>
          ))}
        </View>
      ) : null}
      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(resumeEdit(title, rows))} disabled={invalid} />
    </View>
  );
}

export function LetterEditor({ pack, saving, onSave, onCancel }: EditorProps & { pack: ActionPack }) {
  const t = useT('careerPlans.pack');
  const [title, setTitle] = useState(pack.coverLetter?.title ?? '');
  const [body, setBody] = useState(pack.coverLetter?.body ?? '');
  return (
    <View className="mt-3">
      <Input label={t('letter_title_label')} value={title} onChangeText={setTitle} maxLength={PACK_LIMITS.title} editable={!saving} />
      <Input label={t('letter_body_label')} value={body} onChangeText={setBody} maxLength={PACK_LIMITS.letterBody} {...multiline} style={{ minHeight: 220 }} editable={!saving} />
      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(letterEdit(title, body))} disabled={title.trim() === '' || body.trim() === ''} />
    </View>
  );
}

export function ChecklistEditor({ pack, saving, onSave, onCancel }: EditorProps & { pack: ActionPack }) {
  const t = useT('careerPlans.pack');
  const [rows, setRows] = useState<ChecklistRow[]>(() => checklistRows(pack));
  return (
    <View className="mt-3">
      {rows.map((row, index) => (
        <View key={row.id ?? `new-${index}`} className="flex-row items-start">
          <View className="flex-1 me-2">
            <Input
              accessibilityLabel={t('checklist_item_label')}
              value={row.label}
              onChangeText={(label) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, label } : r)))}
              maxLength={PACK_LIMITS.checklistLabel}
              editable={!saving}
            />
          </View>
          <View className="pt-1">
            <Button size="sm" variant="ghost" onPress={() => setRows((prev) => prev.filter((_, i) => i !== index))} disabled={saving} accessibilityLabel={`${t('checklist_remove')}: ${row.label}`}>
              {t('checklist_remove')}
            </Button>
          </View>
        </View>
      ))}
      <View className="mb-3 self-start">
        <Button
          size="sm"
          variant="outline"
          onPress={() => setRows((prev) => [...prev, { original: '', label: '', done: false }])}
          disabled={saving || !canAddChecklistRow(rows)}
        >
          {t('checklist_add')}
        </Button>
      </View>
      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(checklistEdit(rows))} />
    </View>
  );
}

export function NextStepsEditor({ initial, saving, onSave, onCancel }: EditorProps & { initial: string[] }) {
  const t = useT('careerPlans.pack');
  const [text, setText] = useState(initial.join('\n'));
  return (
    <View className="mt-3">
      <Input label={t('next_steps')} value={text} onChangeText={setText} {...multiline} style={{ minHeight: 120 }} hint={t('edit_one_per_line')} editable={!saving} />
      <Actions saving={saving} onCancel={onCancel} onSave={() => onSave(nextStepsEdit(text))} />
    </View>
  );
}
