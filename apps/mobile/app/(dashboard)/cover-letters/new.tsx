import { Ionicons } from '@expo/vector-icons';
import { usePreventRemove } from '@react-navigation/native';
import { useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../../src/components/ui/Button';
import { Input } from '../../../src/components/ui/Input';
import { useCreateCoverLetter } from '../../../src/hooks/useCoverLetters';
import { useGenerateCoverLetterDraft } from '../../../src/hooks/useCoverLetterAI';
import { useGenerateJobDescription } from '../../../src/hooks/useAI';
import { useCVList } from '../../../src/hooks/useCVs';
import { api } from '../../../src/lib/api';
import { useAuthStore } from '../../../src/store/auth-store';
import { canCreateCoverLetter, canUseAI, effectivePlanForCopy } from '../../../src/lib/entitlements';
import { isLimitRejection, requestFailureMessage } from '../../../src/lib/api-errors';
import { alertIfUnverifiedEmail } from '../../../src/lib/email-verification';
import {
  aiCreditsExhaustedMessage,
  coverLetterLimitReachedMessage,
  upgradeAlertButtons,
} from '../../../src/config/paid-upgrades';
import {
  aiChargeNote,
  buildJobDescriptionRequest,
  draftChargeNote,
  draftToHtml,
  readAiContent,
} from '../../../src/lib/cover-letter-ai';
import { COVER_LETTER_MAX, buildCreatePayload, validateNewLetter } from '../../../src/lib/cover-letter-payload';
import { LENGTH_HINT, LENGTH_OPTIONS, TONE_OPTIONS } from '../../../src/lib/cover-letter-options';
import type { CoverLetterLength, CoverLetterTone } from '../../../src/types/cover-letter.types';
import { colors } from '../../../src/theme/colors';

const IN_APP_WARNING =
  'Please review all generated Cover Letter content before submitting it. You are responsible for ensuring that all statements accurately represent your qualifications and experience.';

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <View className="bg-white border border-stone-100 rounded-2xl p-4 mb-4">
      <Text className="font-bold text-stone-900 mb-1">{title}</Text>
      {description ? <Text className="text-stone-500 text-sm mb-3">{description}</Text> : <View className="h-2" />}
      {children}
    </View>
  );
}

function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: string }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      className={[
        'flex-row items-center px-4 rounded-xl border min-h-11',
        selected ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white',
      ].join(' ')}
    >
      {icon ? (
        <Ionicons name={icon as any} size={16} color={selected ? colors.brand[600] : colors.stone[500]} />
      ) : null}
      <Text className={[icon ? 'ml-2' : '', 'font-medium', selected ? 'text-brand-700' : 'text-stone-600'].join(' ')}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function NewCoverLetterScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuthStore();
  const createCL = useCreateCoverLetter();
  const generateDraft = useGenerateCoverLetterDraft();
  const generateJobDesc = useGenerateJobDescription();
  const { data: cvData, isLoading: cvsLoading, error: cvsError, refetch: refetchCVs } = useCVList(1, 100);
  const cvs = cvData?.items ?? [];

  const [title, setTitle] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [linkedCVId, setLinkedCVId] = useState('');
  const [tone, setTone] = useState<CoverLetterTone>('professional');
  const [length, setLength] = useState<CoverLetterLength>('medium');
  /** The generated letter, held for review. Nothing is created until "Save letter". */
  const [draft, setDraft] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  /** Set once the letter exists; turns the leave guard off, then navigates. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | undefined>(undefined);
  // If the create succeeded but writing the content failed, retry reuses the
  // same letter instead of creating a duplicate (web createdIdRef).
  const createdIdRef = useRef<string | null>(null);

  const form = { title, recipientName, companyName, jobTitle, jobDescription, linkedCVId };
  const hasInput =
    draft !== null ||
    [title, recipientName, companyName, jobTitle, jobDescription].some((v) => v.trim().length > 0);
  const busy = createCL.isPending || generateDraft.isPending || savingDraft;

  usePreventRemove(hasInput && openId === null, ({ data }) => {
    const message = draft !== null
      ? 'Your generated letter has not been saved. If you leave, it is lost and the Engine credit is not returned.'
      : 'You have unsaved changes. Leave anyway?';
    Alert.alert('Unsaved Changes', message, [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  useEffect(() => {
    if (openId) router.replace(`/(dashboard)/cover-letters/${openId}`);
  }, [openId, router]);

  const goToBilling = () => router.push('/(dashboard)/settings/billing');

  const ensureLetterQuota = (): boolean => {
    if (!user?.usage) {
      Alert.alert('Could not create cover letter', 'Could not load your usage. Please try again.');
      return false;
    }
    if (!canCreateCoverLetter(user.subscription, user.usage.coverLettersCreated)) {
      Alert.alert(
        'Cover Letter Limit Reached',
        coverLetterLimitReachedMessage(effectivePlanForCopy(user.subscription)),
        upgradeAlertButtons(goToBilling),
      );
      return false;
    }
    return true;
  };

  const ensureAICredits = (): boolean => {
    if (!canUseAI(user?.subscription, user?.usage?.aiCreditsUsed ?? 0, user?.usage?.aiCreditsLimit)) {
      Alert.alert('Credits Exhausted', aiCreditsExhaustedMessage('coverLetter'), upgradeAlertButtons(goToBilling));
      return false;
    }
    return true;
  };

  const handleCreateFailure = (err: unknown) => {
    if (alertIfUnverifiedEmail(err)) return;
    if (isLimitRejection(err)) {
      Alert.alert(
        'Cover Letter Limit Reached',
        coverLetterLimitReachedMessage(effectivePlanForCopy(user?.subscription)),
        upgradeAlertButtons(goToBilling),
      );
      return;
    }
    Alert.alert('Could not create cover letter', requestFailureMessage(err, 'Failed to create cover letter.'));
  };

  const validate = (mode: 'blank' | 'ai'): boolean => {
    const problem = validateNewLetter(form, mode);
    setTitleError(form.title.trim() ? undefined : problem ?? undefined);
    if (problem) {
      Alert.alert(mode === 'ai' ? 'Missing details' : 'Title is required', problem);
      return false;
    }
    return true;
  };

  const createBlank = async () => {
    if (busy || !validate('blank') || !ensureLetterQuota()) return;
    try {
      const cl = await createCL.mutateAsync(buildCreatePayload(form));
      setOpenId(cl.id);
    } catch (err) {
      handleCreateFailure(err);
    }
  };

  const startGeneration = () => {
    // A fast double tap can land twice before the re-render; each spends a credit.
    if (generateDraft.isPending) return;
    if (!validate('ai') || !ensureLetterQuota() || !ensureAICredits()) return;
    generateDraft.mutate(
      { jobTitle, jobDescription, companyName, linkedCVId, tone, length },
      {
        onSuccess: (text) => setDraft(text),
        onError: (err) => {
          alertIfUnverifiedEmail(err);
        },
      },
    );
  };

  const saveDraft = async () => {
    if (draft === null || !draft.trim() || busy) return;
    setSavingDraft(true);
    try {
      let id = createdIdRef.current;
      if (!id) {
        const created = await createCL.mutateAsync(buildCreatePayload(form));
        id = created.id;
        createdIdRef.current = id;
      }
      await api.put(`/cover-letters/${id}`, { content: draftToHtml(draft) });
      setOpenId(id);
    } catch (err) {
      handleCreateFailure(err);
    } finally {
      setSavingDraft(false);
    }
  };

  const runJobDescription = () => {
    generateJobDesc.mutate(buildJobDescriptionRequest(jobTitle, companyName), {
      onSuccess: (res) => {
        try {
          setJobDescription(readAiContent(res).slice(0, COVER_LETTER_MAX.jobDescription));
        } catch (err) {
          Alert.alert('Could not generate', (err as Error).message);
        }
        void useAuthStore.getState().syncUser();
      },
      onError: (err) => {
        void useAuthStore.getState().syncUser();
        if (alertIfUnverifiedEmail(err)) return;
        Alert.alert(
          'Could not generate',
          `${requestFailureMessage(err, 'Generation failed. Try again.')}\n\n${aiChargeNote(err)}`,
        );
      },
    });
  };

  const generateJobDescription = () => {
    if (generateJobDesc.isPending) return;
    if (!jobTitle.trim()) {
      Alert.alert('Job title needed', 'Job title is required to generate description');
      return;
    }
    if (!ensureAICredits()) return;
    if (jobDescription.trim()) {
      Alert.alert('Replace job description?', 'The generated description will replace the text you entered.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: runJobDescription },
      ]);
      return;
    }
    runJobDescription();
  };

  const discardDraft = () => {
    Alert.alert('Discard this letter?', 'The generated letter has not been saved and will be lost.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => setDraft(null) },
    ]);
  };

  const showReview = draft !== null && !generateDraft.isPending;
  const generateError = generateDraft.isError && !generateDraft.isPending ? generateDraft.error : null;

  return (
    <SafeAreaView className="flex-1 bg-stone-50">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <View className="flex-row items-center px-5 pt-4 pb-3 bg-white border-b border-stone-100">
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="mr-2 w-11 h-11 items-center justify-center"
          >
            <Ionicons name="arrow-back" size={22} color={colors.stone[700]} />
          </TouchableOpacity>
          <Text className="text-xl font-black text-stone-900">New Cover Letter</Text>
        </View>

        <ScrollView className="flex-1 px-5 pt-4" keyboardShouldPersistTaps="handled">
          <Section title="Basic Information">
            <Input
              label="Title *"
              placeholder="e.g. Software Engineer at Google"
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                if (titleError && v.trim()) setTitleError(undefined);
              }}
              maxLength={COVER_LETTER_MAX.title}
              error={titleError}
            />
            <Input
              label="Recipient Name"
              placeholder="e.g. Hiring Manager"
              value={recipientName}
              onChangeText={setRecipientName}
              maxLength={COVER_LETTER_MAX.recipientName}
            />
          </Section>

          <Section title="Job Details">
            <Input
              label="Company Name"
              placeholder="e.g. Google"
              value={companyName}
              onChangeText={setCompanyName}
              maxLength={COVER_LETTER_MAX.companyName}
            />
            <Input
              label="Job Title"
              placeholder="e.g. Senior Software Engineer"
              value={jobTitle}
              onChangeText={setJobTitle}
              maxLength={COVER_LETTER_MAX.jobTitle}
            />
            <View className="flex-row items-center justify-between mb-1.5">
              <Text className="text-sm font-medium text-stone-700">Job Description</Text>
              <TouchableOpacity
                onPress={generateJobDescription}
                disabled={!jobTitle.trim() || generateJobDesc.isPending}
                accessibilityRole="button"
                accessibilityLabel="Generate job description with the Flacron Engine"
                accessibilityState={{ disabled: !jobTitle.trim() || generateJobDesc.isPending, busy: generateJobDesc.isPending }}
                className={['flex-row items-center px-3 min-h-11 rounded-xl', !jobTitle.trim() ? 'opacity-50' : ''].join(' ')}
              >
                {generateJobDesc.isPending ? (
                  <ActivityIndicator size="small" color={colors.brand[600]} />
                ) : (
                  <Ionicons name="sparkles" size={14} color={colors.brand[600]} />
                )}
                <Text className="text-brand-600 text-xs font-semibold ml-1.5">
                  {generateJobDesc.isPending ? 'Generating...' : 'Generate'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={jobDescription}
              onChangeText={setJobDescription}
              placeholder="Paste the job description here..."
              placeholderTextColor={colors.stone[400]}
              multiline
              maxLength={COVER_LETTER_MAX.jobDescription}
              accessibilityLabel="Job Description"
              textAlignVertical="top"
              className="border border-stone-200 rounded-xl bg-white p-3 text-base text-stone-900 min-h-28"
            />
            <Text className="text-xs text-stone-500 mt-1.5">
              Adding a job description helps the Flacron Engine write a more tailored cover letter
            </Text>
          </Section>

          <Section title="Link to CV" description="Link a CV to help the Flacron Engine personalize your cover letter">
            {cvsLoading ? (
              <ActivityIndicator size="small" color={colors.brand[600]} />
            ) : cvsError ? (
              <TouchableOpacity onPress={() => void refetchCVs()} accessibilityRole="button" className="min-h-11 justify-center">
                <Text className="text-sm text-stone-500">
                  {requestFailureMessage(cvsError, 'Could not load your CVs.')} <Text className="text-brand-600 font-semibold">Retry</Text>
                </Text>
              </TouchableOpacity>
            ) : (
              <View accessibilityRole="radiogroup">
                {[{ id: '', title: 'No CV selected' }, ...cvs.map((cv) => ({ id: cv.id, title: cv.title }))].map((option) => {
                  const selected = linkedCVId === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id || 'none'}
                      onPress={() => setLinkedCVId(option.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      className={[
                        'flex-row items-center px-3 min-h-11 rounded-xl border mb-2',
                        selected ? 'border-brand-600 bg-brand-50' : 'border-stone-200 bg-white',
                      ].join(' ')}
                    >
                      <Ionicons
                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                        size={18}
                        color={selected ? colors.brand[600] : colors.stone[400]}
                      />
                      <Text className={['ml-2 flex-1', selected ? 'text-brand-700 font-medium' : 'text-stone-700'].join(' ')} numberOfLines={1}>
                        {option.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Section>

          <Section
            title="Writing options"
            description="Choose how the Flacron Engine should write your letter. You can read and edit the result before anything is saved."
          >
            <Text className="text-sm font-medium text-stone-700 mb-2">Tone</Text>
            <View className="flex-row flex-wrap gap-2 mb-4" accessibilityRole="radiogroup">
              {TONE_OPTIONS.map((option) => (
                <Chip key={option.value} label={option.label} icon={option.icon} selected={tone === option.value} onPress={() => setTone(option.value)} />
              ))}
            </View>
            <Text className="text-sm font-medium text-stone-700 mb-2">Length</Text>
            <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
              {LENGTH_OPTIONS.map((option) => (
                <Chip key={option.value} label={option.label} selected={length === option.value} onPress={() => setLength(option.value)} />
              ))}
            </View>
            <Text className="text-xs text-stone-500 mt-2">{LENGTH_HINT}</Text>
          </Section>

          {generateDraft.isPending && (
            <View className="bg-brand-50 border border-brand-200 rounded-2xl p-4 mb-4 flex-row items-center" accessibilityLiveRegion="polite">
              <ActivityIndicator size="small" color={colors.brand[600]} />
              <View className="ml-3 flex-1">
                <Text className="font-semibold text-stone-900">Generating your cover letter…</Text>
                <Text className="text-sm text-stone-600 mt-0.5">
                  This usually takes 10–30 seconds. Please keep this screen open.
                </Text>
              </View>
            </View>
          )}

          {generateError && (
            <View className="bg-warning-bg border border-amber-200 rounded-2xl p-4 mb-4" accessibilityRole="alert">
              <View className="flex-row items-start">
                <Ionicons name="warning-outline" size={22} color={colors.warning.DEFAULT} />
                <View className="ml-3 flex-1">
                  <Text className="font-semibold text-stone-900">We couldn&apos;t generate your cover letter</Text>
                  <Text className="text-sm text-stone-600 mt-0.5">
                    {requestFailureMessage(generateError, 'Generation failed. Try again.')}
                  </Text>
                  <Text className="text-xs text-stone-500 mt-2">{draftChargeNote(generateError)}</Text>
                </View>
              </View>
              <View className="mt-3">
                <Button variant="outline" size="sm" onPress={startGeneration} icon={<Ionicons name="refresh" size={16} color={colors.stone[700]} />}>
                  Retry
                </Button>
              </View>
            </View>
          )}

          {showReview && (
            <View className="bg-white border border-brand-200 rounded-2xl p-4 mb-4">
              <Text className="font-bold text-stone-900">Review your letter</Text>
              <Text className="text-sm text-stone-500 mt-1 mb-3">
                Nothing has been saved yet. Edit the text below, then save it when you are happy with it.
              </Text>
              <TextInput
                value={draft ?? ''}
                onChangeText={setDraft}
                multiline
                accessibilityLabel="Generated cover letter"
                textAlignVertical="top"
                className="border border-stone-200 rounded-xl p-3 text-base text-stone-900 min-h-96"
              />
            </View>
          )}

          <View className="bg-warning-bg rounded-xl p-3 mb-4 flex-row">
            <Ionicons name="information-circle-outline" size={18} color={colors.warning.DEFAULT} />
            <Text className="text-xs text-stone-700 ml-2 flex-1">{IN_APP_WARNING}</Text>
          </View>

          {showReview ? (
            <View className="gap-3">
              <Button
                variant="primary"
                fullWidth
                size="lg"
                loading={savingDraft}
                disabled={busy || !draft?.trim()}
                onPress={() => void saveDraft()}
                icon={<Ionicons name="save-outline" size={18} color={colors.white} />}
              >
                Save letter
              </Button>
              <Button
                variant="outline"
                fullWidth
                disabled={busy}
                onPress={startGeneration}
                icon={<Ionicons name="refresh" size={18} color={colors.stone[700]} />}
              >
                Regenerate
              </Button>
              <Button variant="ghost" fullWidth disabled={busy} onPress={discardDraft}>
                Discard
              </Button>
            </View>
          ) : (
            <View className="gap-3">
              <Button
                variant="primary"
                fullWidth
                size="lg"
                loading={generateDraft.isPending}
                disabled={busy}
                onPress={startGeneration}
                icon={<Ionicons name="sparkles" size={18} color={colors.white} />}
              >
                Generate Letter
              </Button>
              <Button
                variant="outline"
                fullWidth
                loading={createCL.isPending && !savingDraft}
                disabled={busy}
                onPress={() => void createBlank()}
                icon={<Ionicons name="document-outline" size={18} color={colors.stone[700]} />}
              >
                Create Blank
              </Button>
            </View>
          )}
          <View className="h-8" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
