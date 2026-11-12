import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MatchResult, OpportunityDetail, ReportReason, ViewerReport } from '../../../../../../packages/career-api-client/src/types';
import { CareerHeader, Pill } from '../../../../src/components/career/CareerHeader';
import { Button } from '../../../../src/components/ui/Button';
import { EmptyState } from '../../../../src/components/ui/EmptyState';
import { ErrorState } from '../../../../src/components/ui/ErrorState';
import { Modal } from '../../../../src/components/ui/Modal';
import { SkeletonCard } from '../../../../src/components/ui/Skeleton';
import {
  useCareerFeature,
  useCreateMatch,
  useOpportunity,
  useOpportunityTrust,
  useReportOpportunity,
  useSavedMatch,
} from '../../../../src/hooks/career/opportunities';
import { useCareerAccess, useCareerResumes } from '../../../../src/hooks/useCareer';
import {
  compareErrorMessage,
  confidenceText,
  FIT_LABEL,
  isStale,
  locationsText,
  matchLines,
  NOT_A_SCORE,
  NOT_STATED,
  openableUrl,
  overlapText,
  payText,
  pickTrust,
  remainingAnalyses,
  remainingText,
  REPORT_NOTES_MAX,
  REPORT_REASONS,
  reportErrorMessage,
  reportStatusText,
  signalText,
  sponsorshipText,
  TRUST_DISCLAIMER,
  TRUST_NONE,
  versionChoices,
} from '../../../../src/lib/career/opportunities';
import { careerErrorMessage, formatDay } from '../../../../src/lib/career-view';
import { colors } from '../../../../src/theme/colors';

/**
 * One listing: the saved text, locations, pay, deadline and sponsorship (never
 * guessed), the listing checks with a report form, and the website's "Compare
 * with my resume" (POST /matches, mode explicit, one resume analysis, nothing
 * charged twice for the same click). The comparison is overlap with confirmed
 * facts, never a hiring probability.
 */
export default function OpportunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const access = useCareerAccess();
  const detail = useOpportunity(id);
  const trust = useOpportunityTrust(id);
  const [nowMs] = useState(() => Date.now());

  let content: React.ReactNode;
  if (access.data && !access.data.enabled) {
    content = <EmptyState icon="lock-closed-outline" title="Career tools are not included in your plan" />;
  } else if (access.isLoading || detail.isLoading) {
    content = (
      <View className="p-5">
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  } else if (detail.error && (detail.error as { status?: number }).status === 404) {
    content = <EmptyState icon="briefcase-outline" title="That listing is not in FlacronCV" description="It may have been removed." />;
  } else if (access.error || detail.error || !detail.data) {
    content = (
      <ErrorState
        message={careerErrorMessage(detail.error ?? access.error, 'This listing could not be loaded. Nothing was changed.')}
        onRetry={() => void detail.refetch()}
      />
    );
  } else {
    const item = detail.data;
    content = (
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={detail.isRefetching}
            onRefresh={() => {
              void detail.refetch();
              void trust.refetch();
            }}
            tintColor={colors.brand[600]}
          />
        }
      >
        <ListingCard item={item} stale={isStale(item.checkedAt, nowMs)} />
        <TrustCard item={item} trust={pickTrust(item, trust.data)} />
        <CompareCard item={item} />
      </ScrollView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-stone-50" edges={['top', 'bottom']}>
      <CareerHeader title={detail.data?.title ?? 'Listing'} subtitle={detail.data?.organization ?? undefined} />
      {content}
    </SafeAreaView>
  );
}

function openSource(url: string | null) {
  const safe = openableUrl(url);
  if (!safe) return;
  Linking.openURL(safe).catch(() => Alert.alert('Could not open the link', 'No app on this device can open it.'));
}

function SourceLink({ url }: { url: string }) {
  return (
    <TouchableOpacity
      onPress={() => openSource(url)}
      className="flex-row items-center min-h-[44px] mt-2"
      accessibilityRole="link"
      accessibilityLabel="Open the original listing in the browser"
    >
      <Ionicons name="open-outline" size={16} color={colors.brand[600]} />
      <Text className="text-brand-600 font-semibold text-sm ml-1.5">Original listing</Text>
    </TouchableOpacity>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row mt-2">
      <Text className="text-stone-500 text-sm w-28">{label}</Text>
      <Text className="text-stone-900 text-sm flex-1">{value}</Text>
    </View>
  );
}

function ListingCard({ item, stale }: { item: OpportunityDetail; stale: boolean }) {
  const source = openableUrl(item.sourceUrl);
  return (
    <>
      {stale ? (
        <View className="bg-warning-bg rounded-2xl p-4 mb-4">
          <Text className="text-warning font-semibold">This listing has not been checked recently</Text>
          <Text className="text-warning text-sm mt-1 leading-5">The saved text is still here. Open the original listing to confirm it.</Text>
          {source ? <SourceLink url={source} /> : null}
        </View>
      ) : null}
      <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
        <View className="flex-row items-start justify-between">
          <Text className="text-stone-500 text-sm flex-1 mr-2">{item.organization ?? NOT_STATED}</Text>
          <Pill label={item.label === 'expired' ? 'EXPIRED' : 'OPEN'} tone={item.label === 'expired' ? 'default' : 'success'} />
        </View>
        <Field label="Locations" value={locationsText(item.locations)} />
        <Field label="Pay" value={payText(item.compensation)} />
        <Field label="Sponsorship" value={sponsorshipText(item.sponsorship)} />
        <Field label="Deadline" value={formatDay(item.deadline) ?? NOT_STATED} />
        <Text className="text-stone-400 text-xs mt-3">{`Last checked ${item.checkedAt.slice(0, 10)}`}</Text>
        <Text className="text-stone-900 text-sm mt-4 leading-5" selectable>
          {item.description}
        </Text>
        {source && !stale ? <SourceLink url={source} /> : null}
      </View>
    </>
  );
}

const SIGNAL_TONE = { info: 'text-stone-700', warning: 'text-warning', alert: 'text-red-600' } as const;

function TrustCard({ item, trust }: { item: OpportunityDetail; trust: ReturnType<typeof pickTrust> }) {
  const report = useReportOpportunity(item.id);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [localReport, setLocalReport] = useState<ViewerReport | null>(null);

  const viewerReport = trust?.viewerReport ?? localReport;
  const status = reportStatusText(viewerReport);

  const submit = () => {
    if (busy.current) return;
    if (!reason) {
      setError('Choose a reason.');
      return;
    }
    busy.current = true;
    setError(null);
    report.mutate(
      { reason, notes: notes.trim() || undefined },
      {
        onSuccess: (reported) => {
          setOpen(false);
          setNotes('');
          // Shown until the refreshed checks arrive (the website does the same).
          setLocalReport({ reportId: reported.reportId, reason: reported.reason, status: 'pending', reviewAction: null, createdAt: item.checkedAt });
        },
        onError: (caught) => setError(reportErrorMessage(caught)),
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  };

  return (
    <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
      <Text className="font-bold text-stone-900 text-base" accessibilityRole="header">
        Listing checks
      </Text>
      <Text className="text-stone-500 text-sm mt-1 leading-5">{TRUST_DISCLAIMER}</Text>
      <Text className="text-stone-700 text-sm mt-3">{`Last checked ${item.checkedAt.slice(0, 10)}`}</Text>
      <Text className="text-stone-700 text-sm mt-2 leading-5">{confidenceText(item, trust)}</Text>
      {item.label === 'expired' ? <Text className="text-warning text-sm mt-2">The saved status says this listing is expired.</Text> : null}
      {trust && trust.signals.length > 0 ? (
        <View className="mt-3">
          {trust.signals.map((signal) => (
            <View key={signal.key} className="flex-row mt-1.5">
              <Ionicons
                name={signal.severity === 'info' ? 'information-circle-outline' : 'warning-outline'}
                size={16}
                color={signal.severity === 'alert' ? colors.error.DEFAULT : signal.severity === 'warning' ? colors.warning.DEFAULT : colors.stone[500]}
              />
              <Text className={`${SIGNAL_TONE[signal.severity]} text-sm ml-1.5 flex-1 leading-5`}>
                {signalText(signal, trust.sourcesCount, trust.reportCount)}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-stone-700 text-sm mt-3 leading-5">{TRUST_NONE}</Text>
      )}
      {status ? (
        <Text className="text-stone-900 text-sm mt-3" accessibilityLiveRegion="polite">
          {status}
        </Text>
      ) : null}
      <View className="mt-4">
        <Button
          variant="outline"
          onPress={() => {
            setError(null);
            setOpen(true);
          }}
          icon={<Ionicons name="flag-outline" size={16} color={colors.stone[700]} />}
        >
          {viewerReport?.status === 'pending' ? 'Update your report' : 'Report an issue'}
        </Button>
      </View>

      <Modal visible={open} onClose={() => setOpen(false)} title="Report this listing" size="lg" closeDisabled={report.isPending}>
        <Text className="text-sm font-medium text-stone-700 mb-2">Reason</Text>
        <View accessibilityRole="radiogroup">
          {REPORT_REASONS.map((option) => {
            const selected = reason === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => setReason(option.value)}
                className={`flex-row items-center min-h-[44px] px-3 mb-2 rounded-xl border ${selected ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option.label}
              >
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={18} color={selected ? colors.brand[600] : colors.stone[400]} />
                <Text className="text-stone-900 text-sm ml-2">{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text className="text-sm font-medium text-stone-700 mt-2 mb-1.5">Notes, optional</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={REPORT_NOTES_MAX}
          textAlignVertical="top"
          accessibilityLabel="Notes, optional"
          className="bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-base text-stone-900 min-h-[96px]"
          placeholderTextColor={colors.stone[400]}
        />
        <Text className="text-stone-400 text-xs mt-1 mb-3">One open report per person. Sending again updates that report.</Text>
        {error ? (
          <Text className="text-red-500 text-sm mb-3" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <Button fullWidth onPress={submit} loading={report.isPending}>
          Submit report
        </Button>
        <View className="mt-2">
          <Button fullWidth variant="ghost" onPress={() => setOpen(false)} disabled={report.isPending}>
            Cancel
          </Button>
        </View>
      </Modal>
    </View>
  );
}

function CompareCard({ item }: { item: OpportunityDetail }) {
  const feature = useCareerFeature('resumeAnalyses');
  const resumes = useCareerResumes();
  const choices = versionChoices(resumes.data);
  const [versionId, setVersionId] = useState<string | null>(null);
  const selected = versionId ?? choices[0]?.versionId ?? null;
  const saved = useSavedMatch(item.id, selected);
  const create = useCreateMatch(item.id);
  const [error, setError] = useState<string | null>(null);
  // One key per comparison (listing + CV version): a retry after a failure reuses it, so it is never charged twice.
  const keyRef = useRef<{ pair: string; key: string } | null>(null);

  useEffect(() => setError(null), [selected]);

  if (!feature.on) {
    return (
      <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
        <Text className="font-bold text-stone-900 text-base">Compare with my resume</Text>
        <Text className="text-stone-500 text-sm mt-1">Resume analysis is not included in your career plan.</Text>
      </View>
    );
  }

  const remaining = remainingAnalyses(item.resumeAnalysis);
  const match: MatchResult | null | undefined = saved.data;

  const run = () => {
    if (!selected || create.isPending) return;
    const pair = `${item.id}:${selected}`;
    if (!keyRef.current || keyRef.current.pair !== pair) keyRef.current = { pair, key: Crypto.randomUUID() };
    const idempotencyKey = keyRef.current.key;
    setError(null);
    create.mutate(
      { versionId: selected, idempotencyKey },
      {
        onSuccess: () => {
          keyRef.current = null;
        },
        onError: (caught) => setError(compareErrorMessage(caught)),
      },
    );
  };

  const confirm = () => {
    Alert.alert(
      'This uses 1 resume analysis',
      match
        ? `${remainingText(item.resumeAnalysis)} If your facts and the listing have not changed, the saved comparison comes back at no cost. It is not a hiring probability.`
        : `${remainingText(item.resumeAnalysis)} This compares the listing with your resume. It is not a hiring probability.`,
      [
        { text: 'Leave', style: 'cancel' },
        { text: 'Use 1 analysis', onPress: run },
      ],
    );
  };

  return (
    <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
      <Text className="font-bold text-stone-900 text-base" accessibilityRole="header">
        Compare with my resume
      </Text>
      <Text className="text-stone-500 text-sm mt-1 leading-5">{remainingText(item.resumeAnalysis)}</Text>

      {resumes.isLoading ? (
        <Text className="text-stone-400 text-sm mt-3">Loading your career CVs…</Text>
      ) : resumes.error ? (
        <Text className="text-red-500 text-sm mt-3">{careerErrorMessage(resumes.error, 'Your career CVs could not be loaded.')}</Text>
      ) : choices.length === 0 ? (
        <Text className="text-stone-700 text-sm mt-3">Create a resume first. No analysis was used.</Text>
      ) : (
        <View className="mt-3" accessibilityRole="radiogroup">
          <Text className="text-sm font-medium text-stone-700 mb-2">Career CV to compare</Text>
          {choices.map((choice) => {
            const on = choice.versionId === selected;
            return (
              <TouchableOpacity
                key={choice.versionId}
                onPress={() => setVersionId(choice.versionId)}
                disabled={create.isPending}
                className={`flex-row items-center min-h-[44px] px-3 mb-2 rounded-xl border ${on ? 'border-brand-500 bg-brand-50' : 'border-stone-200 bg-white'}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: create.isPending }}
                accessibilityLabel={`${choice.title}, ${choice.language}`}
              >
                <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? colors.brand[600] : colors.stone[400]} />
                <Text className="text-stone-900 text-sm ml-2 flex-1" numberOfLines={1}>
                  {choice.title}
                </Text>
                <Text className="text-stone-400 text-xs">{choice.language}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {choices.length > 0 ? (
        <View className="mt-2">
          <Button onPress={confirm} loading={create.isPending} disabled={!selected || (remaining === 0 && !match)}>
            {match ? 'Compare again' : 'Compare with my resume'}
          </Button>
          {remaining === 0 && !match ? <Text className="text-stone-500 text-sm mt-2">No resume analyses left. The listing is still here.</Text> : null}
        </View>
      ) : null}

      {error ? (
        <View className="mt-3">
          <Text className="text-red-500 text-sm" accessibilityRole="alert">
            {error}
          </Text>
          <TouchableOpacity onPress={run} className="min-h-[44px] justify-center" accessibilityRole="button" accessibilityLabel="Try the same comparison again">
            <Text className="text-brand-600 font-semibold text-sm">Try again (not charged twice)</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {match ? <MatchView match={match} /> : null}
    </View>
  );
}

function MatchView({ match }: { match: MatchResult }) {
  const lines = matchLines(match);
  const icon = { reason: 'checkmark-circle-outline', gap: 'remove-circle-outline', unknown: 'help-circle-outline' } as const;
  const tint = { reason: colors.success.DEFAULT, gap: colors.warning.DEFAULT, unknown: colors.stone[500] };
  return (
    <View className="mt-4 pt-4 border-t border-stone-100" accessibilityLiveRegion="polite">
      <Text className="font-bold text-stone-900">{FIT_LABEL[match.fit]}</Text>
      <Text className="text-stone-500 text-xs mt-1 leading-4">{NOT_A_SCORE}</Text>
      <Text className="text-stone-700 text-sm mt-2">{overlapText(match.overlap)}</Text>
      {lines.map((line) => (
        <View key={line.key} className="flex-row mt-2">
          <Ionicons name={icon[line.kind]} size={16} color={tint[line.kind]} />
          <Text className="text-stone-800 text-sm ml-1.5 flex-1 leading-5">{line.text}</Text>
        </View>
      ))}
      <Text className="text-stone-400 text-xs mt-3">{`Compared ${formatDay(match.createdAt) ?? ''}`}</Text>
    </View>
  );
}
