import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import React, { useState } from 'react';
import { Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ActionPackEdit } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { ChecklistEditor, FitEditor, LetterEditor, NextStepsEditor, ResumeEditor } from '../../../../src/components/career/plans/PackEditors';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import {
  useActionPack,
  useCancelActionPack,
  useRetryActionPackLetter,
  useSaveActionPackDocuments,
  useToggleChecklist,
  useUpdateActionPack,
} from '../../../../src/hooks/career/action-packs';
import { useCareerAccess } from '../../../../src/hooks/useCareer';
import {
  cancelErrorMessage,
  checklistErrorMessage,
  checklistLabel,
  checklistProgress,
  downloadErrorMessage,
  editErrorMessage,
  exportTitle,
  fitLabel,
  fitLines,
  fitTone,
  isEditable,
  isEdited,
  isFinalRetryFailure,
  letterAttemptsLeft,
  nextStepTexts,
  normalizePack,
  organizationName,
  packStatus,
  retryErrorMessage,
  saveDocumentsErrorMessage,
  savedToDocuments,
  type ExportComponent,
  type ExportFormat,
  type PackComponent,
} from '../../../../src/lib/career/action-packs';
import { careerApi } from '../../../../src/lib/career-api';
import { shareCareerFile } from '../../../../src/lib/career-files';
import { careerErrorMessage, FACT_TYPE_LABEL, formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';
import { useT } from '../../../../src/i18n';

type Note = { tone: 'success' | 'error'; text: string; documentsLink?: boolean } | null;

/**
 * One action pack, as the website's detail column shows it: vacancy, fit
 * reasons and gaps, the preparation checklist (ticking is free), the tailored
 * cover letter, the tailored résumé and the next steps. Every component can be
 * edited (free). A complete pack can be copied into Documents and downloaded
 * as PDF or DOCX through the share sheet (free; the pack credit covers its
 * documents). An unfinished pack (the letter failed) holds its one credit:
 * retrying the letter is free and cancelling returns the credit.
 */
export default function ActionPackScreen() {
  const t = useT('careerPlans');
  const tp = useT('careerPlans.pack');
  const tc = useT('common');
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useCareerAccess();
  const pack = useActionPack(id);
  const toggle = useToggleChecklist(id);
  const retry = useRetryActionPackLetter(id);
  const cancel = useCancelActionPack();
  const update = useUpdateActionPack(id);
  const saveDocs = useSaveActionPackDocuments(id);
  const router = useRouter();
  const [note, setNote] = useState<Note>(null);
  const [editing, setEditing] = useState<PackComponent | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(dashboard)/career/action-pack' as Href);
  };

  const onRetry = () => {
    setNote(null);
    retry.mutate(undefined, {
      onSuccess: (paid) =>
        setNote(
          packStatus(paid.actionPack) === 'complete'
            ? { tone: 'success', text: t('actionPack.retrySucceeded') }
            : { tone: 'error', text: t('actionPack.retryFailed') },
        ),
      onError: (error) => {
        if (isFinalRetryFailure(error)) {
          // The server removed the pack and returned the credit.
          Alert.alert(t('notUpdated'), retryErrorMessage(error), [{ text: tc('ok'), onPress: leave }]);
          return;
        }
        setNote({ tone: 'error', text: retryErrorMessage(error) });
      },
    });
  };

  const onCancel = (expired: boolean) => {
    if (!id) return;
    Alert.alert(
      expired ? t('actionPack.deletePack') : t('actionPack.cancelPack'),
      expired ? t('actionPack.statusExpired') : t('actionPack.cancelConfirm'),
      [
        { text: tc('cancel'), style: 'cancel' },
        {
          text: expired ? tc('delete') : t('actionPack.cancelPackShort'),
          style: 'destructive',
          onPress: () =>
            cancel.mutate(id, {
              onSuccess: () => Alert.alert(t('actionPack.cancelDoneTitle'), t('actionPack.cancelDone'), [{ text: tc('ok'), onPress: leave }]),
              onError: (error) => setNote({ tone: 'error', text: cancelErrorMessage(error) }),
            }),
        },
      ],
    );
  };

  const onToggle = (checklistId: string, done: boolean) => {
    toggle.mutate({ checklistId, done }, { onError: (error) => Alert.alert(t('notUpdated'), checklistErrorMessage(error)) });
  };

  const onSaveEdit = (edit: ActionPackEdit) => {
    setNote(null);
    update.mutate(edit, {
      onSuccess: () => {
        setEditing(null);
        setNote({ tone: 'success', text: tp('edit_saved') });
      },
      onError: (error) => setNote({ tone: 'error', text: editErrorMessage(error) }),
    });
  };

  const onSaveDocuments = () => {
    setNote(null);
    saveDocs.mutate(undefined, {
      onSuccess: () => setNote({ tone: 'success', text: tp('saved_documents'), documentsLink: true }),
      onError: (error) => setNote({ tone: 'error', text: saveDocumentsErrorMessage(error) }),
    });
  };

  const onDownload = async (component: ExportComponent, format: ExportFormat) => {
    if (!id || !pack.data || downloading) return;
    setNote(null);
    setDownloading(`${component}-${format}`);
    try {
      const file = await careerApi.exportActionPack(id, component, format);
      const outcome = await shareCareerFile(file, exportTitle(pack.data, component), format);
      if (outcome === 'sharing_unavailable') setNote({ tone: 'error', text: t('packUse.sharingUnavailable') });
    } catch (error) {
      setNote({ tone: 'error', text: downloadErrorMessage(error) });
    } finally {
      setDownloading(null);
    }
  };

  const startEdit = (component: PackComponent) => {
    setNote(null);
    setEditing(component);
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('lockedTitle')} />;
  } else if (pack.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (pack.error || !pack.data) {
    content = <ErrorState message={careerErrorMessage(pack.error, t('actionPack.openError'))} onRetry={() => void pack.refetch()} />;
  } else {
    const p = normalizePack(pack.data);
    const progress = checklistProgress(p);
    const status = packStatus(p);
    const attemptsLeft = letterAttemptsLeft(p);
    const busy = retry.isPending || cancel.isPending;
    const editable = isEditable(p) && !busy;
    const fit = fitLines(p);
    const steps = nextStepTexts(p);
    const head = (title: string, component: PackComponent) => (
      <View className="flex-row items-center flex-wrap gap-2">
        <Text className="flex-1 text-base font-bold text-stone-900" accessibilityRole="header">
          {title}
        </Text>
        {isEdited(p, component) ? <Pill label={tp('edited_badge')} /> : null}
        {editable && editing !== component && !(component === 'coverLetter' && !p.coverLetter) ? (
          <Button size="sm" variant="ghost" onPress={() => startEdit(component)} disabled={editing !== null} accessibilityLabel={`${tp('edit')}: ${title}`}>
            {tp('edit')}
          </Button>
        ) : null}
      </View>
    );
    const editorProps = { saving: update.isPending, onSave: onSaveEdit, onCancel: () => setEditing(null) };
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={pack.isRefetching && !pack.isPlaceholderData} onRefresh={() => void pack.refetch()} tintColor={colors.brand[600]} />}
      >
        {note ? (
          <View className={`rounded-xl p-3 mb-4 ${note.tone === 'success' ? 'bg-success-bg' : 'bg-red-50'}`} accessibilityLiveRegion="polite">
            <Text className={`text-sm ${note.tone === 'success' ? 'text-success' : 'text-red-700'}`}>{note.text}</Text>
            {note.documentsLink ? (
              <TouchableOpacity onPress={() => router.push('/(dashboard)/career/documents' as Href)} className="min-h-[44px] justify-center" accessibilityRole="link">
                <Text className="text-success text-sm font-bold underline">{tp('open_documents')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {status === 'partial' || (status === 'generating' && p.coverLetter === null) ? (
          <View className="bg-warning-bg rounded-2xl p-4 mb-4" accessibilityLiveRegion="polite">
            <Text className="text-warning font-bold mb-1">{t('actionPack.statusPartialTitle')}</Text>
            <Text className="text-warning text-sm leading-5">{status === 'partial' ? t('actionPack.statusPartial') : t('actionPack.statusGenerating')}</Text>
            {status === 'partial' ? <Text className="text-warning text-xs mt-1">{t('actionPack.attemptsLeft', { count: attemptsLeft })}</Text> : null}
            <View className="mt-3 gap-2">
              {status === 'partial' && attemptsLeft > 0 ? (
                <Button onPress={onRetry} loading={retry.isPending} disabled={busy} fullWidth>
                  {t('actionPack.retryLetter')}
                </Button>
              ) : null}
              <Button variant="outline" onPress={() => onCancel(false)} loading={cancel.isPending} disabled={busy} fullWidth>
                {t('actionPack.cancelPack')}
              </Button>
            </View>
          </View>
        ) : null}
        {status === 'expired' ? (
          <View className="bg-stone-100 rounded-2xl p-4 mb-4">
            <Text className="text-stone-700 text-sm leading-5">{t('actionPack.statusExpired')}</Text>
            <View className="mt-3">
              <Button variant="outline" onPress={() => onCancel(true)} loading={cancel.isPending} disabled={busy} fullWidth>
                {t('actionPack.deletePack')}
              </Button>
            </View>
          </View>
        ) : null}

        <Card>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 me-2">
              <Text className="text-lg font-bold text-stone-900">{p.vacancySnapshot.title}</Text>
              <Text className="text-brand-700 text-sm font-medium mt-0.5">{organizationName(p.vacancySnapshot.organization)}</Text>
            </View>
            <Pill label={fitLabel(p.fit.fit)} tone={fitTone(p.fit.fit)} />
          </View>
          <Text className="text-stone-400 text-xs mt-2">
            {[
              t('actionPack.created', { date: formatDay(p.createdAt) ?? '' }),
              p.vacancySnapshot.deadline ? t('actionPack.deadline', { date: formatDay(p.vacancySnapshot.deadline) ?? '' }) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {p.vacancySnapshot.description ? (
            <>
              <SectionLabel>{t('actionPack.vacancyOverview')}</SectionLabel>
              <Text className="text-stone-700 text-sm leading-5" numberOfLines={6}>
                {p.vacancySnapshot.description}
              </Text>
            </>
          ) : null}
          <View className="mt-4">{head(tp('fit_reasons'), 'fit')}</View>
          {editing === 'fit' ? (
            <FitEditor reasons={fit.reasons} gaps={fit.gaps} {...editorProps} />
          ) : (
            <>
              <View className="mt-1.5">
                {fit.reasons.length > 0 ? (
                  fit.reasons.map((r, i) => <Bullet key={i} icon="checkmark-circle-outline" color={colors.success.DEFAULT} text={r} />)
                ) : (
                  <Text className="text-stone-500 text-sm">{t('actionPack.noReasons')}</Text>
                )}
              </View>
              <SectionLabel>{tp('skill_gaps')}</SectionLabel>
              {fit.gaps.length > 0 ? (
                fit.gaps.map((g, i) => <Bullet key={i} icon="alert-circle-outline" color={colors.warning.DEFAULT} text={g} />)
              ) : (
                <Text className="text-stone-500 text-sm">{tp('no_major_gaps')}</Text>
              )}
            </>
          )}
          {p.fit.unknowns.length > 0 ? (
            <>
              <SectionLabel>{t('actionPack.unknowns')}</SectionLabel>
              {p.fit.unknowns.map((u, i) => (
                <Bullet key={i} icon="help-circle-outline" color={colors.stone[400]} text={u} />
              ))}
            </>
          ) : null}
        </Card>

        {status === 'complete' ? (
          <Card>
            <Text className="text-base font-bold text-stone-900" accessibilityRole="header">
              {tp('export_heading')}
            </Text>
            <Text className="text-stone-500 text-xs mt-0.5 mb-3 leading-4">{tp('export_free')}</Text>
            <Button onPress={onSaveDocuments} loading={saveDocs.isPending} disabled={editing !== null} fullWidth>
              {savedToDocuments(p) ? tp('save_documents_again') : tp('save_documents')}
            </Button>
            <Text className="text-stone-500 text-xs mt-3 mb-2">{t('packUse.downloadHint')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {(
                [
                  ['tailoredResume', 'pdf', tp('download_resume_pdf')],
                  ['tailoredResume', 'docx', tp('download_resume_docx')],
                  ['coverLetter', 'pdf', tp('download_letter_pdf')],
                  ['coverLetter', 'docx', tp('download_letter_docx')],
                ] as const
              ).map(([component, format, label]) => (
                <Button
                  key={`${component}-${format}`}
                  size="sm"
                  variant="outline"
                  onPress={() => void onDownload(component, format)}
                  loading={downloading === `${component}-${format}`}
                  disabled={downloading !== null || (component === 'coverLetter' && !p.coverLetter)}
                  icon={<Ionicons name="share-outline" size={16} color={colors.stone[700]} />}
                >
                  {label}
                </Button>
              ))}
            </View>
          </Card>
        ) : null}

        <Card>
          {head(t('actionPack.checklist'), 'checklist')}
          {editing === 'checklist' ? (
            <ChecklistEditor pack={p} {...editorProps} />
          ) : (
            <>
              <Text className="text-stone-500 text-xs mt-0.5 mb-3">{t('actionPack.checklistProgress', { done: progress.done, total: progress.total })}</Text>
              {p.checklist.map((item) => {
                const label = checklistLabel(p, item);
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => onToggle(item.id, !item.done)}
                    className="flex-row items-start border border-stone-100 rounded-xl p-3 mb-2 min-h-[44px]"
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.done }}
                    accessibilityLabel={label}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={item.done ? 'checkbox' : 'square-outline'} size={22} color={item.done ? colors.brand[600] : colors.stone[400]} />
                    <Text className={`flex-1 ms-3 text-sm leading-5 ${item.done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}
        </Card>

        <Card>
          {head(t('actionPack.coverLetter'), 'coverLetter')}
          {editing === 'coverLetter' && p.coverLetter ? (
            <LetterEditor pack={p} {...editorProps} />
          ) : p.coverLetter ? (
            <Text selectable className="text-stone-800 text-sm leading-6 mt-2">
              {p.coverLetter.body}
            </Text>
          ) : (
            <Text className="text-stone-500 text-sm mt-2">{t('actionPack.letterPending')}</Text>
          )}
        </Card>

        <Card>
          {head(t('packUse.tailoredResume'), 'tailoredResume')}
          <Text className="text-stone-500 text-xs mt-0.5">{t('actionPack.factsIncluded', { count: p.tailoredResume.factIds.length })}</Text>
          {p.tailoredResume.relevance ? <Text className="text-stone-500 text-xs mt-0.5">{tp('resume_tailored_hint')}</Text> : null}
          {editing === 'tailoredResume' ? (
            <ResumeEditor pack={p} {...editorProps} />
          ) : (
            <>
              <Text className="text-stone-900 text-sm font-semibold mt-3">{p.tailoredResume.title}</Text>
              {p.tailoredResume.lines.map((line, idx) => {
                const matched = p.tailoredResume.relevance?.[line.factId];
                return (
                  <View key={`${line.factId}-${idx}`} className="py-2 border-t border-stone-100 mt-2">
                    <Text className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">{FACT_TYPE_LABEL[line.factType] ?? line.factType}</Text>
                    <Text selectable className="text-stone-800 text-sm mt-0.5 leading-5">
                      {line.text}
                    </Text>
                    {matched && matched.length > 0 ? <Text className="text-stone-500 text-xs mt-0.5">{tp('matches', { words: matched.join(', ') })}</Text> : null}
                  </View>
                );
              })}
            </>
          )}
        </Card>

        <Card>
          {head(t('actionPack.nextSteps'), 'nextSteps')}
          {editing === 'nextSteps' ? (
            <NextStepsEditor initial={steps} {...editorProps} />
          ) : (
            <View className="mt-2">
              {steps.map((step, idx) => (
                <View key={idx} className="flex-row mb-2">
                  <Text className="text-stone-500 text-sm w-6">{`${idx + 1}.`}</Text>
                  <Text className="flex-1 text-stone-800 text-sm leading-5">{step}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
        <Text className="text-stone-400 text-xs leading-4">{t('packUse.footer')}</Text>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={pack.data?.vacancySnapshot.title ?? t('actionPack.detailSubtitle')} subtitle={t('actionPack.detailSubtitle')} />
      {content}
    </SafeAreaView>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4">{children}</View>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text className="text-xs font-semibold text-stone-500 uppercase tracking-wide mt-4 mb-1.5">{children}</Text>;
}

function Bullet({ icon, color, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; text: string }) {
  return (
    <View className="flex-row items-start mb-1.5">
      <Ionicons name={icon} size={16} color={color} style={{ marginTop: 2 }} />
      <Text className="flex-1 ms-2 text-stone-700 text-sm leading-5">{text}</Text>
    </View>
  );
}
