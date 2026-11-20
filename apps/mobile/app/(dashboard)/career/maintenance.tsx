import { ApiError } from '../../../../../packages/career-api-client/src/client';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CareerHeader, Pill } from '../../../src/components/career/CareerHeader';
import { Choice, Note } from '../../../src/components/career/plans/PlanBits';
import { Button } from '../../../src/components/ui/Button';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../src/components/ui/ErrorState';
import { Input } from '../../../src/components/ui/Input';
import { SkeletonCard } from '../../../src/components/ui/Skeleton';
import { useEvidenceList } from '../../../src/hooks/career/evidence';
import { useConfirmPromotion, useMaintenance, useMaintenanceActions } from '../../../src/hooks/career/maintenance';
import { useCareerAccess, useCareerFacts } from '../../../src/hooks/useCareer';
import { useLeaveGuard } from '../../../src/hooks/useLeaveGuard';
import {
  achievementDraft,
  checkAchievement,
  checkPromotion,
  checkCredentialDraft,
  checkGoal,
  credentialDraft,
  credentialLines,
  deleteErrorMessage,
  EMPTY_ACHIEVEMENT,
  EMPTY_CREDENTIAL,
  EMPTY_GOAL,
  EMPTY_PROMOTION,
  errorField,
  factOptionLabel,
  formatExpiry,
  goalDraft,
  goalStatusLabel,
  isBlankDraft,
  linkLabels,
  linksOf,
  maintenanceErrorMessage,
  MAX_DETAILS,
  MAX_SHORT,
  MAX_TITLE,
  NO_LINKS,
  reminderText,
  withLinks,
  type AchievementDraft,
  type CredentialDraft,
  type GoalDraft,
  type ItemLinks,
  type PromotionDraft,
} from '../../../src/lib/career/maintenance';
import { careerErrorMessage } from '../../../src/lib/career-view';
import { colors } from '../../../src/theme/colors';
import { useT } from '../../../src/i18n';
import type { MaintenancePromotionGoal } from '../../../../../packages/career-api-client/src/types';

type Section = 'achievement' | 'goal' | 'credential';
type Errors = Record<string, string | undefined>;
type Notice = { section: Section; tone: 'success' | 'error'; text: string } | null;

/** `id` null = adding a new entry; a string = editing that entry. */
interface Editing<D> {
  id: string | null;
  draft: D;
}

const dateInputProps = {
  keyboardType: Platform.OS === 'ios' ? ('numbers-and-punctuation' as const) : ('default' as const),
  autoCapitalize: 'none' as const,
  autoCorrect: false,
  maxLength: 10,
};
const dateOnly = (text: string) => text.replace(/[^0-9-]/g, '');

/**
 * Career maintenance, as on the website (career/maintenance): achievements,
 * promotion goals and credentials, each editable and removable, plus the
 * reminder list the server derives from credential expiry and review dates
 * (90 days ahead). All free. A promotion goal is not a confirmed fact: only
 * the explicit "I got this promotion" confirmation changes the profile.
 * Achievements and credentials can be linked to a profile fact or an evidence
 * item. Impossible dates are refused.
 */
export default function CareerMaintenanceScreen() {
  const t = useT('careerPlans');
  const tc = useT('common');
  const access = useCareerAccess();
  const view = useMaintenance();
  const actions = useMaintenanceActions();
  const [achievement, setAchievement] = useState<Editing<AchievementDraft>>({ id: null, draft: EMPTY_ACHIEVEMENT });
  const [goal, setGoal] = useState<Editing<GoalDraft>>({ id: null, draft: EMPTY_GOAL });
  const [credential, setCredential] = useState<Editing<CredentialDraft>>({ id: null, draft: EMPTY_CREDENTIAL });
  const [errors, setErrors] = useState<Record<Section, Errors>>({ achievement: {}, goal: {}, credential: {} });
  const [notice, setNotice] = useState<Notice>(null);
  const [achLinks, setAchLinks] = useState<ItemLinks>(NO_LINKS);
  const [credLinks, setCredLinks] = useState<ItemLinks>(NO_LINKS);
  // "I got this promotion": the goal being confirmed and how the profile changes.
  const [confirming, setConfirming] = useState<MaintenancePromotionGoal | null>(null);
  const [promotion, setPromotion] = useState<PromotionDraft>(EMPTY_PROMOTION);
  const [promotionError, setPromotionError] = useState<string | null>(null);
  const confirmPromotion = useConfirmPromotion();
  const facts = useCareerFacts();
  const evidence = useEvidenceList();
  const ts = useT('careerPlans.scope');
  const factOptions = [{ value: '', label: ts('scenario_no_link') }, ...(facts.data?.items ?? []).map((f) => ({ value: f.id, label: factOptionLabel(f as never) }))];
  const evidenceOptions = [{ value: '', label: ts('scenario_no_link') }, ...(evidence.data?.items ?? []).map((e) => ({ value: e.id, label: e.title }))];
  const experienceOptions = [
    { value: '', label: t('promotion.newRole') },
    ...(facts.data?.items ?? []).filter((f) => f.factType === 'experience').map((f) => ({ value: f.id, label: factOptionLabel(f as never) })),
  ];

  const onConfirmPromotion = () => {
    if (!confirming) return;
    const check = checkPromotion(promotion);
    if (!check.ok) return setPromotionError(check.message);
    setPromotionError(null);
    confirmPromotion.mutate(
      { id: confirming.id, body: check.input },
      {
        onSuccess: () => {
          setConfirming(null);
          setPromotion(EMPTY_PROMOTION);
          setNotice({ section: 'goal', tone: 'success', text: ts('promotion_confirmed') });
        },
        onError: (error) => setPromotionError(maintenanceErrorMessage(error)),
      },
    );
  };

  const busy = Object.values(actions).some((m) => m.isPending) || confirmPromotion.isPending;
  useLeaveGuard(
    achievement.id !== null || goal.id !== null || credential.id !== null ||
      !isBlankDraft(achievement.draft) || !isBlankDraft(goal.draft) || !isBlankDraft(credential.draft),
  );

  const setSectionErrors = (section: Section, next: Errors) => setErrors((e) => ({ ...e, [section]: next }));
  const clearField = (section: Section, field: string) => setErrors((e) => ({ ...e, [section]: { ...e[section], [field]: undefined, form: undefined } }));

  /** A server refusal goes next to its field when it names one, otherwise under the form. */
  const fail = (section: Section) => (error: unknown) => {
    const field = errorField(error) ?? 'form';
    setSectionErrors(section, { [field]: maintenanceErrorMessage(error) });
  };
  const succeed = (section: Section, text: string, reset: () => void) => () => {
    reset();
    setSectionErrors(section, {});
    setNotice({ section, tone: 'success', text });
  };

  const confirmDelete = (section: Section, title: string, body: string, run: (opts: { onSuccess: () => void; onError: (e: unknown) => void }) => void) => {
    Alert.alert(title, body, [
      { text: tc('cancel'), style: 'cancel' },
      {
        text: tc('delete'),
        style: 'destructive',
        onPress: () =>
          run({
            onSuccess: () => setNotice({ section, tone: 'success', text: t('maintenance.deleted') }),
            onError: (error) => setNotice({ section, tone: 'error', text: deleteErrorMessage(error) }),
          }),
      },
    ]);
  };

  const onSaveAchievement = () => {
    setNotice(null);
    const check = checkAchievement(achievement.draft);
    if (!check.ok) return setSectionErrors('achievement', check.errors);
    const reset = () => {
      setAchievement({ id: null, draft: EMPTY_ACHIEVEMENT });
      setAchLinks(NO_LINKS);
    };
    const done = succeed('achievement', achievement.id ? t('maintenance.changesSaved') : t('maintenance.achievementSaved'), reset);
    const input = withLinks(check.input, achLinks);
    if (achievement.id) actions.updateAchievement.mutate({ id: achievement.id, patch: input }, { onSuccess: done, onError: fail('achievement') });
    else actions.addAchievement.mutate(input, { onSuccess: done, onError: fail('achievement') });
  };

  const onSaveGoal = () => {
    setNotice(null);
    const check = checkGoal(goal.draft);
    if (!check.ok) return setSectionErrors('goal', check.errors);
    const reset = () => setGoal({ id: null, draft: EMPTY_GOAL });
    const done = succeed('goal', goal.id ? t('maintenance.changesSaved') : t('maintenance.goalSaved'), reset);
    if (goal.id) actions.updatePromotionGoal.mutate({ id: goal.id, patch: check.input }, { onSuccess: done, onError: fail('goal') });
    else actions.addPromotionGoal.mutate(check.input, { onSuccess: done, onError: fail('goal') });
  };

  const onSaveCredential = () => {
    setNotice(null);
    const check = checkCredentialDraft(credential.draft);
    if (!check.ok) return setSectionErrors('credential', check.errors);
    const reset = () => {
      setCredential({ id: null, draft: EMPTY_CREDENTIAL });
      setCredLinks(NO_LINKS);
    };
    const done = succeed('credential', credential.id ? t('maintenance.changesSaved') : t('maintenance.credentialSaved'), reset);
    const input = withLinks(check.input, credLinks);
    if (credential.id) actions.updateCredential.mutate({ id: credential.id, patch: input }, { onSuccess: done, onError: fail('credential') });
    else actions.addCredential.mutate(input, { onSuccess: done, onError: fail('credential') });
  };

  const onDropGoal = (id: string) => {
    setNotice(null);
    actions.updatePromotionGoal.mutate(
      { id, patch: { status: 'dropped' } },
      {
        onSuccess: () => setNotice({ section: 'goal', tone: 'success', text: t('maintenance.goalDropped') }),
        onError: (error) => setNotice({ section: 'goal', tone: 'error', text: maintenanceErrorMessage(error) }),
      },
    );
  };

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title={t('lockedTitle')} />;
  } else if (access.isLoading || view.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (view.error instanceof ApiError && view.error.code === 'feature_unavailable') {
    content = <EmptyState icon="lock-closed-outline" title={t('maintenance.notOpen')} description={t('maintenance.nothingChanged')} />;
  } else if (access.error || view.error || !view.data) {
    content = <ErrorState message={careerErrorMessage(view.error ?? access.error, t('maintenance.loadError'))} onRetry={() => void view.refetch()} />;
  } else {
    const data = view.data;
    const reminders = data.reminders ?? [];
    const sectionNotice = (section: Section) => (notice?.section === section ? <NoticeText tone={notice.tone} text={notice.text} /> : null);
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={view.isRefetching} onRefresh={() => void view.refetch()} tintColor={colors.brand[600]} />}
      >
        <Text className="text-stone-500 text-sm mb-4 leading-5">{t('maintenance.intro')}</Text>

        <View className={`rounded-2xl p-4 mb-4 ${reminders.length > 0 ? 'bg-warning-bg' : 'bg-surface border border-stone-100'}`} accessibilityLiveRegion="polite">
          <Text className={`font-bold mb-1 ${reminders.length > 0 ? 'text-warning' : 'text-stone-900'}`} accessibilityRole="header">
            {t('maintenance.remindersTitle')}
          </Text>
          {reminders.length === 0 ? (
            <Text className="text-stone-500 text-sm">{t('maintenance.remindersEmpty')}</Text>
          ) : (
            reminders.map((r) => (
              <Text key={`${r.credentialId}-${r.kind}`} className="text-warning text-sm mt-0.5">{`${r.name} — ${reminderText(r)}`}</Text>
            ))
          )}
        </View>

        <Card title={t('maintenance.achievements')}>
          {data.achievements.length === 0 ? <Muted>{t('maintenance.noAchievements')}</Muted> : null}
          {data.achievements.map((a) => (
            <ItemRow
              key={a.id}
              title={a.title}
              lines={[a.details, a.achievedOn ? formatExpiry(a.achievedOn) : '', ...linkLabels(a)].filter(Boolean)}
              editing={achievement.id === a.id}
              disabled={busy}
              onEdit={() => {
                setNotice(null);
                setSectionErrors('achievement', {});
                setAchievement({ id: a.id, draft: achievementDraft(a) });
                setAchLinks(linksOf(a));
              }}
              onDelete={() =>
                confirmDelete('achievement', t('maintenance.deleteAchievementTitle'), t('maintenance.deleteBody', { name: a.title }), (opts) =>
                  actions.deleteAchievement.mutate(a.id, {
                    ...opts,
                    onSuccess: () => {
                      if (achievement.id === a.id) setAchievement({ id: null, draft: EMPTY_ACHIEVEMENT });
                      opts.onSuccess();
                    },
                  }),
                )
              }
            />
          ))}
          <FormHeading text={achievement.id ? t('maintenance.editAchievement') : t('maintenance.newAchievement')} />
          <Input
            label={t('maintenance.achievementTitle')}
            value={achievement.draft.title}
            onChangeText={(title) => {
              setAchievement((s) => ({ ...s, draft: { ...s.draft, title } }));
              clearField('achievement', 'title');
            }}
            placeholder={t('maintenance.achievementPlaceholder')}
            maxLength={MAX_TITLE}
            error={errors.achievement.title}
            editable={!busy}
          />
          <Input
            label={t('maintenance.achievementDetails')}
            value={achievement.draft.details}
            onChangeText={(details) => {
              setAchievement((s) => ({ ...s, draft: { ...s.draft, details } }));
              clearField('achievement', 'details');
            }}
            multiline
            maxLength={MAX_DETAILS}
            style={{ minHeight: 70, textAlignVertical: 'top' }}
            error={errors.achievement.details}
            editable={!busy}
          />
          <Input
            label={t('maintenance.achievementDate')}
            value={achievement.draft.achievedOn}
            onChangeText={(text) => {
              setAchievement((s) => ({ ...s, draft: { ...s.draft, achievedOn: dateOnly(text) } }));
              clearField('achievement', 'achievedOn');
            }}
            placeholder={t('maintenance.datePlaceholder')}
            {...dateInputProps}
            error={errors.achievement.achievedOn}
            editable={!busy}
          />
          <Choice label={ts('link_fact')} value={achLinks.factId} options={factOptions} onChange={(factId) => setAchLinks((l) => ({ ...l, factId }))} disabled={busy} />
          <Choice label={ts('link_evidence')} value={achLinks.evidenceId} options={evidenceOptions} onChange={(evidenceId) => setAchLinks((l) => ({ ...l, evidenceId }))} disabled={busy} />
          <FormButtons
            saveLabel={achievement.id ? t('maintenance.saveChanges') : t('maintenance.addAchievement')}
            onSave={onSaveAchievement}
            loading={actions.addAchievement.isPending || actions.updateAchievement.isPending}
            disabled={busy || achievement.draft.title.trim() === ''}
            onCancel={achievement.id ? () => { setAchievement({ id: null, draft: EMPTY_ACHIEVEMENT }); setAchLinks(NO_LINKS); setSectionErrors('achievement', {}); } : undefined}
          />
          {errors.achievement.form ? <NoticeText tone="error" text={errors.achievement.form} /> : null}
          {sectionNotice('achievement')}
        </Card>

        <Card title={t('maintenance.goals')}>
          {data.promotionGoals.length === 0 ? <Muted>{t('maintenance.noGoals')}</Muted> : null}
          {data.promotionGoals.map((g) => (
            <ItemRow
              key={g.id}
              title={g.desiredTitle}
              lines={g.targetDate ? [t('maintenance.goalTarget', { date: formatExpiry(g.targetDate) })] : []}
              pill={{ label: goalStatusLabel(g.status), tone: g.status === 'confirmed' ? 'success' : g.status === 'dropped' ? 'default' : 'brand' }}
              editing={goal.id === g.id}
              disabled={busy}
              // An achieved goal changed the profile; the server refuses edits to it.
              onEdit={g.status === 'confirmed' ? undefined : () => {
                setNotice(null);
                setSectionErrors('goal', {});
                setGoal({ id: g.id, draft: goalDraft(g) });
              }}
              extras={
                g.status === 'open'
                  ? [
                      {
                        label: ts('promotion_got_it'),
                        onPress: () => {
                          setNotice(null);
                          setPromotionError(null);
                          setPromotion(EMPTY_PROMOTION);
                          setConfirming(g);
                        },
                      },
                      { label: t('maintenance.goalDrop'), onPress: () => onDropGoal(g.id) },
                    ]
                  : undefined
              }
              onDelete={() =>
                confirmDelete('goal', t('maintenance.deleteGoalTitle'), t('maintenance.deleteBody', { name: g.desiredTitle }), (opts) =>
                  actions.deletePromotionGoal.mutate(g.id, {
                    ...opts,
                    onSuccess: () => {
                      if (goal.id === g.id) setGoal({ id: null, draft: EMPTY_GOAL });
                      opts.onSuccess();
                    },
                  }),
                )
              }
            />
          ))}
          {confirming ? (
            <View className="bg-brand-50 border border-brand-100 rounded-xl p-3 mt-3">
              <Text className="text-base font-bold text-stone-900" accessibilityRole="header">
                {ts('promotion_confirm_title')}
              </Text>
              <Text className="text-sm text-stone-600 mt-1 mb-3 leading-5">{ts('promotion_confirm_body', { title: confirming.desiredTitle })}</Text>
              <Choice
                label={ts('promotion_update_role')}
                value={promotion.factId}
                options={experienceOptions}
                onChange={(factId) => {
                  setPromotion((p) => ({ ...p, factId }));
                  setPromotionError(null);
                }}
                disabled={confirmPromotion.isPending}
              />
              {promotion.factId ? null : (
                <>
                  <Input
                    label={ts('promotion_company')}
                    value={promotion.company}
                    onChangeText={(company) => {
                      setPromotion((p) => ({ ...p, company }));
                      setPromotionError(null);
                    }}
                    maxLength={MAX_SHORT}
                    editable={!confirmPromotion.isPending}
                  />
                  <Input
                    label={ts('promotion_start')}
                    value={promotion.startDate}
                    onChangeText={(text) => setPromotion((p) => ({ ...p, startDate: dateOnly(text) }))}
                    placeholder={t('maintenance.datePlaceholder')}
                    {...dateInputProps}
                    editable={!confirmPromotion.isPending}
                  />
                </>
              )}
              {promotionError ? <Note tone="error" text={promotionError} /> : null}
              <View className="gap-2">
                <Button onPress={onConfirmPromotion} loading={confirmPromotion.isPending} fullWidth>
                  {ts('promotion_confirm_go')}
                </Button>
                <Button variant="outline" onPress={() => setConfirming(null)} disabled={confirmPromotion.isPending} fullWidth>
                  {tc('cancel')}
                </Button>
              </View>
            </View>
          ) : null}
          <FormHeading text={goal.id ? t('maintenance.editGoal') : t('maintenance.goal')} />
          <Input
            label={t('maintenance.goal')}
            value={goal.draft.desiredTitle}
            onChangeText={(desiredTitle) => {
              setGoal((s) => ({ ...s, draft: { ...s.draft, desiredTitle } }));
              clearField('goal', 'desiredTitle');
            }}
            placeholder={t('maintenance.goalPlaceholder')}
            maxLength={MAX_TITLE}
            error={errors.goal.desiredTitle}
            editable={!busy}
          />
          <Input
            label={t('maintenance.goalTargetDate')}
            value={goal.draft.targetDate}
            onChangeText={(text) => {
              setGoal((s) => ({ ...s, draft: { ...s.draft, targetDate: dateOnly(text) } }));
              clearField('goal', 'targetDate');
            }}
            placeholder={t('maintenance.datePlaceholder')}
            {...dateInputProps}
            error={errors.goal.targetDate}
            editable={!busy}
          />
          <FormButtons
            saveLabel={goal.id ? t('maintenance.saveChanges') : t('maintenance.saveGoal')}
            onSave={onSaveGoal}
            loading={actions.addPromotionGoal.isPending || (actions.updatePromotionGoal.isPending && goal.id !== null)}
            disabled={busy || goal.draft.desiredTitle.trim() === ''}
            onCancel={goal.id ? () => { setGoal({ id: null, draft: EMPTY_GOAL }); setSectionErrors('goal', {}); } : undefined}
          />
          {errors.goal.form ? <NoticeText tone="error" text={errors.goal.form} /> : null}
          {sectionNotice('goal')}
        </Card>

        <Card title={t('maintenance.credentials')}>
          <Text className="text-stone-500 text-xs mb-2">{t('maintenance.credentialsHelp')}</Text>
          {data.credentials.length === 0 ? <Muted>{t('maintenance.noCredentials')}</Muted> : null}
          {data.credentials.map((c) => (
            <ItemRow
              key={c.id}
              title={c.name}
              lines={[...credentialLines(c), ...linkLabels(c)]}
              pill={c.due ? { label: t('maintenance.dueSoon'), tone: 'warning' } : undefined}
              editing={credential.id === c.id}
              disabled={busy}
              onEdit={() => {
                setNotice(null);
                setSectionErrors('credential', {});
                setCredential({ id: c.id, draft: credentialDraft(c) });
                setCredLinks(linksOf(c));
              }}
              onDelete={() =>
                confirmDelete('credential', t('maintenance.deleteCredentialTitle'), t('maintenance.deleteCredentialBody', { name: c.name }), (opts) =>
                  actions.deleteCredential.mutate(c.id, {
                    ...opts,
                    onSuccess: () => {
                      if (credential.id === c.id) setCredential({ id: null, draft: EMPTY_CREDENTIAL });
                      opts.onSuccess();
                    },
                  }),
                )
              }
            />
          ))}
          <FormHeading text={credential.id ? t('maintenance.editCredential') : t('maintenance.credential')} />
          <Input
            label={t('maintenance.credential')}
            value={credential.draft.name}
            onChangeText={(name) => {
              setCredential((s) => ({ ...s, draft: { ...s.draft, name } }));
              clearField('credential', 'name');
            }}
            placeholder={t('maintenance.credentialPlaceholder')}
            maxLength={MAX_TITLE}
            error={errors.credential.name}
            editable={!busy}
          />
          <Input
            label={t('maintenance.expiresOn')}
            value={credential.draft.expiresOn}
            onChangeText={(text) => {
              setCredential((s) => ({ ...s, draft: { ...s.draft, expiresOn: dateOnly(text) } }));
              clearField('credential', 'expiresOn');
            }}
            placeholder={t('maintenance.datePlaceholder')}
            {...dateInputProps}
            hint={t('maintenance.dateHint')}
            error={errors.credential.expiresOn}
            editable={!busy}
          />
          <Input
            label={t('maintenance.reviewOn')}
            value={credential.draft.reviewOn}
            onChangeText={(text) => {
              setCredential((s) => ({ ...s, draft: { ...s.draft, reviewOn: dateOnly(text) } }));
              clearField('credential', 'reviewOn');
            }}
            placeholder={t('maintenance.datePlaceholder')}
            {...dateInputProps}
            error={errors.credential.reviewOn}
            editable={!busy}
          />
          <Input
            label={t('maintenance.issuer')}
            value={credential.draft.issuer}
            onChangeText={(issuer) => {
              setCredential((s) => ({ ...s, draft: { ...s.draft, issuer } }));
              clearField('credential', 'issuer');
            }}
            maxLength={MAX_SHORT}
            error={errors.credential.issuer}
            editable={!busy}
          />
          <Input
            label={t('maintenance.region')}
            value={credential.draft.region}
            onChangeText={(region) => {
              setCredential((s) => ({ ...s, draft: { ...s.draft, region } }));
              clearField('credential', 'region');
            }}
            maxLength={MAX_SHORT}
            hint={t('maintenance.regionHint')}
            error={errors.credential.region}
            editable={!busy}
          />
          <Choice label={ts('link_fact')} value={credLinks.factId} options={factOptions} onChange={(factId) => setCredLinks((l) => ({ ...l, factId }))} disabled={busy} />
          <Choice label={ts('link_evidence')} value={credLinks.evidenceId} options={evidenceOptions} onChange={(evidenceId) => setCredLinks((l) => ({ ...l, evidenceId }))} disabled={busy} />
          <FormButtons
            saveLabel={credential.id ? t('maintenance.saveChanges') : t('maintenance.saveCredential')}
            onSave={onSaveCredential}
            loading={actions.addCredential.isPending || actions.updateCredential.isPending}
            disabled={busy || credential.draft.name.trim() === '' || credential.draft.expiresOn.trim() === ''}
            onCancel={credential.id ? () => { setCredential({ id: null, draft: EMPTY_CREDENTIAL }); setCredLinks(NO_LINKS); setSectionErrors('credential', {}); } : undefined}
          />
          {errors.credential.form ? <NoticeText tone="error" text={errors.credential.form} /> : null}
          {sectionNotice('credential')}
        </Card>
        <Text className="text-stone-500 text-xs leading-4">{ts('maintenance_free_note')}</Text>
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={t('maintenance.title')} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="bg-surface border border-stone-100 rounded-2xl p-4 mb-4">
      <Text className="text-base font-bold text-stone-900 mb-2" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

function ItemRow({
  title,
  lines,
  pill,
  editing,
  disabled,
  onEdit,
  onDelete,
  extras,
}: {
  title: string;
  lines: string[];
  pill?: { label: string; tone: 'default' | 'brand' | 'warning' | 'success' };
  editing: boolean;
  disabled: boolean;
  onEdit?: () => void;
  onDelete: () => void;
  extras?: { label: string; onPress: () => void }[];
}) {
  const t = useT('careerPlans');
  const tc = useT('common');
  return (
    <View className={`py-2 border-b border-stone-100 ${editing ? 'bg-brand-50 -mx-2 px-2 rounded-lg' : ''}`}>
      <View className="flex-row items-start">
        <Text className="flex-1 me-2 text-sm text-stone-900 font-medium">{title}</Text>
        {pill ? <Pill label={pill.label} tone={pill.tone} /> : null}
      </View>
      {lines.map((line, i) => (
        <Text key={i} className="text-xs text-stone-500 mt-0.5">
          {line}
        </Text>
      ))}
      <View className="flex-row flex-wrap justify-end gap-2 mt-1">
        {(extras ?? []).map((extra) => (
          <Button key={extra.label} size="sm" variant="ghost" className="min-h-[44px]" onPress={extra.onPress} disabled={disabled} accessibilityLabel={`${extra.label}: ${title}`}>
            {extra.label}
          </Button>
        ))}
        {onEdit ? (
          <Button size="sm" variant="outline" className="min-h-[44px]" onPress={onEdit} disabled={disabled || editing} accessibilityLabel={t('maintenance.editA11y', { name: title })}>
            {t('maintenance.edit')}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" className="min-h-[44px]" onPress={onDelete} disabled={disabled} accessibilityLabel={t('maintenance.deleteA11y', { name: title })}>
          {tc('delete')}
        </Button>
      </View>
    </View>
  );
}

function FormHeading({ text }: { text: string }) {
  return <Text className="text-sm font-semibold text-stone-700 mt-4 mb-2">{text}</Text>;
}

function FormButtons({
  saveLabel,
  onSave,
  loading,
  disabled,
  onCancel,
}: {
  saveLabel: string;
  onSave: () => void;
  loading: boolean;
  disabled: boolean;
  onCancel?: () => void;
}) {
  const tc = useT('common');
  return (
    <View className="flex-row gap-2">
      <View className="flex-1">
        <Button variant="outline" onPress={onSave} loading={loading} disabled={disabled} fullWidth>
          {saveLabel}
        </Button>
      </View>
      {onCancel ? (
        <Button variant="ghost" onPress={onCancel} disabled={loading}>
          {tc('cancel')}
        </Button>
      ) : null}
    </View>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <Text className="text-stone-400 text-sm mb-1">{children}</Text>;
}

function NoticeText({ tone, text }: { tone: 'success' | 'error'; text: string }) {
  return (
    <Text className={`${tone === 'success' ? 'text-success' : 'text-red-700'} text-sm mt-2`} accessibilityLiveRegion="polite" accessibilityRole={tone === 'error' ? 'alert' : undefined}>
      {text}
    </Text>
  );
}
