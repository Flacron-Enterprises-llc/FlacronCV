import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter, type Href } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Share, Text, TextInput, View } from 'react-native';
import { CAREER_ENABLED } from '../../config/career';
import { useCareerAccess } from '../../hooks/useCareer';
import { useT } from '../../i18n';
import { careerApi } from '../../lib/career-api';
import { draftContextOf, draftKeyIsSpent, draftProblemOf, draftTypesFor, type ApplicationDraftType, type DraftProblem } from '../../lib/job-workspace';
import { colors } from '../../theme/colors';
import type { JobApplication } from '../../types/job.types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

/**
 * Referral-request and thank-you drafts for one application, written by the
 * career writing service (website: components/jobs/ApplicationDrafts). Shown
 * only when the career integration is on AND the account has career access;
 * otherwise nothing renders and the tracker behaves as before. Nothing is ever
 * sent for the person: they review the draft and share it themselves.
 */
export function ApplicationDrafts({ job }: { job: JobApplication }) {
  const access = useCareerAccess();
  if (!CAREER_ENABLED || access.data?.enabled !== true) return null;
  const types = draftTypesFor(job);
  if (types.length === 0) return null;
  return <DraftButtons job={job} types={types} />;
}

function DraftButtons({ job, types }: { job: JobApplication; types: ApplicationDraftType[] }) {
  const t = useT('jobs.workspace.drafts');
  const tc = useT('common');
  const router = useRouter();
  const [open, setOpen] = useState<ApplicationDraftType | null>(null);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<DraftProblem | null>(null);
  const [draft, setDraft] = useState<{ id: string; body: string } | null>(null);
  // One key per draft type until the request settles: a retry after a lost response is never charged twice.
  const keys = useRef<Partial<Record<ApplicationDraftType, string>>>({});

  const close = () => {
    if (pending) return;
    setOpen(null);
    setProblem(null);
    setDraft(null);
  };

  const create = async (type: ApplicationDraftType) => {
    if (pending) return;
    setPending(true);
    setProblem(null);
    const key = (keys.current[type] ??= Crypto.randomUUID());
    try {
      const paid = await careerApi.createWriting({ type, opportunityId: job.opportunityId || null, context: draftContextOf(job) }, key);
      delete keys.current[type];
      setDraft({ id: paid.document.id, body: paid.document.body });
    } catch (error) {
      if (draftKeyIsSpent(error)) delete keys.current[type];
      setProblem(draftProblemOf(error));
    } finally {
      setPending(false);
    }
  };

  const share = async () => {
    if (!draft) return;
    try {
      await Share.share({ message: draft.body });
    } catch {
      // The text stays selectable in the box above.
    }
  };

  const title = open === 'thank_you' ? t('thank_you.title') : t('referral_request.title');
  const intro = open === 'thank_you' ? t('thank_you.intro', { position: job.position, company: job.company }) : t('referral_request.intro', { position: job.position, company: job.company });

  return (
    <View className="gap-3">
      {types.map((type) => (
        <Button
          key={type}
          variant="outline"
          fullWidth
          onPress={() => setOpen(type)}
          icon={<Ionicons name={type === 'thank_you' ? 'heart-outline' : 'mail-outline'} size={18} color={colors.stone[700]} />}
        >
          {type === 'thank_you' ? t('thank_you.button') : t('referral_request.button')}
        </Button>
      ))}

      <Modal visible={open !== null} onClose={close} title={title} size="lg" closeDisabled={pending}>
        {open && !draft ? (
          <View>
            <Text className="text-stone-600 text-sm leading-5 mb-2">{intro}</Text>
            <Text className="text-stone-600 text-sm leading-5 mb-2">{t('uses_allowance')}</Text>
            {!job.opportunityId ? <Text className="text-stone-600 text-sm leading-5 mb-2">{t('no_opportunity')}</Text> : null}
            {problem ? (
              <View className="bg-warning-bg rounded-xl p-3 mb-3" accessibilityLiveRegion="polite">
                <Text className="text-warning text-sm leading-5" accessibilityRole="alert">
                  {t(`problem.${problem}`)}
                </Text>
                {problem === 'quota' || problem === 'upgrade' ? (
                  <Button variant="ghost" size="sm" className="self-start mt-1" onPress={() => { close(); router.push('/(dashboard)/career/plans' as Href); }}>
                    {t('see_plans')}
                  </Button>
                ) : null}
              </View>
            ) : null}
            <View className="flex-row gap-2 mt-2">
              <View className="flex-1">
                <Button variant="outline" fullWidth onPress={close} disabled={pending}>
                  {tc('cancel')}
                </Button>
              </View>
              <View className="flex-1">
                <Button fullWidth loading={pending} onPress={() => void create(open)}>
                  {problem ? t('retry') : t('create')}
                </Button>
              </View>
            </View>
          </View>
        ) : null}
        {draft ? (
          <View>
            <Text className="text-stone-600 text-sm leading-5 mb-2">{t('review_before_sending')}</Text>
            <TextInput
              value={draft.body}
              editable={false}
              multiline
              scrollEnabled
              accessibilityLabel={t('draft_label')}
              className="bg-white border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-900 min-h-[180px] max-h-[320px]"
              textAlignVertical="top"
            />
            <View className="gap-2 mt-3">
              <Button fullWidth onPress={() => void share()} icon={<Ionicons name="share-outline" size={18} color={colors.white} />}>
                {t('share')}
              </Button>
              <Button
                variant="outline"
                fullWidth
                onPress={() => {
                  close();
                  router.push('/(dashboard)/career/documents' as Href);
                }}
              >
                {t('edit_in_documents')}
              </Button>
            </View>
          </View>
        ) : null}
      </Modal>
    </View>
  );
}
