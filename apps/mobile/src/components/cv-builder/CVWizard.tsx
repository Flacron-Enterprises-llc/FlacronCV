import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { api } from '../../lib/api';
import {
  buildCvRootUpdate,
  buildSectionCreate,
  buildSectionUpdate,
  planSectionSave,
  shouldRecreateSection,
} from '../../lib/cv-editor';
import { Modal } from '../ui/Modal';
import { useCVStore } from '../../store/cv-store';
import { colors } from '../../theme/colors';
import { PersonalInfoStep } from './steps/PersonalInfoStep';
import { SummaryStep } from './steps/SummaryStep';
import { ExperienceStep } from './steps/ExperienceStep';
import { EducationStep } from './steps/EducationStep';
import { SkillsStep } from './steps/SkillsStep';
import { ProjectsStep } from './steps/ProjectsStep';
import { CertificationsStep } from './steps/CertificationsStep';
import { LanguagesStep } from './steps/LanguagesStep';
import { ReferencesStep } from './steps/ReferencesStep';
import { CustomSectionsStep } from './steps/CustomSectionsStep';
import { ArrangeSectionsStep } from './steps/ArrangeSectionsStep';

const STEPS = [
  { id: 'personal', label: 'Personal Info', icon: 'person-outline' },
  { id: 'experience', label: 'Experience', icon: 'briefcase-outline' },
  { id: 'education', label: 'Education', icon: 'school-outline' },
  { id: 'skills', label: 'Skills', icon: 'code-slash-outline' },
  { id: 'summary', label: 'Summary', icon: 'document-text-outline' },
  { id: 'projects', label: 'Projects', icon: 'construct-outline' },
  { id: 'certifications', label: 'Certifications', icon: 'ribbon-outline' },
  { id: 'languages', label: 'Languages', icon: 'language-outline' },
  { id: 'references', label: 'References', icon: 'people-outline' },
  { id: 'custom', label: 'Custom Sections', icon: 'albums-outline' },
  { id: 'arrange', label: 'Arrange Sections', icon: 'swap-vertical-outline' },
] as const;

/** E2 — network (no response) vs rejected request. Do not treat them as one error. */
function saveFailureMessage(err: unknown): string {
  if (axios.isAxiosError(err) && !err.response) {
    return 'No connection. Check your network and try again.';
  }
  return 'Could not save. Please try again.';
}

interface CVWizardProps {
  cvId: string;
  onFinish: () => void;
}

export function CVWizard({ cvId, onFinish }: CVWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [stepValid, setStepValid] = useState(false);
  const [stepPickerOpen, setStepPickerOpen] = useState(false);
  const queryClient = useQueryClient();
  const isSavingRef = useRef(false);

  const handleValidChange = useCallback((isValid: boolean) => {
    setStepValid(isValid);
  }, []);

  const saveProgress = async (): Promise<boolean> => {
    const {
      cv, sections, isDirty, persistedSectionIds,
      setIsSaving, markSaved, markSectionsPersisted,
    } = useCVStore.getState();
    if (!cv) return false;
    if (!isDirty) return true;
    if (isSavingRef.current) return false;
    isSavingRef.current = true;
    setIsSaving(true);

    const snapshot = { cv, sections, persistedSectionIds };
    const plan = planSectionSave(snapshot.sections, snapshot.persistedSectionIds);

    try {
      // E1 — UpdateCvDto whitelist, same keys as web autosave. styling carries
      // only showPhoto so the design screen's colours/fonts are never overwritten.
      await api.put(`/cvs/${cvId}`, buildCvRootUpdate(snapshot.cv));

      // E3 — same order as web: POST new, PUT existing, DELETE removed.
      for (const section of plan.create) {
        await api.post(`/cvs/${cvId}/sections`, buildSectionCreate(section));
      }
      for (const section of plan.update) {
        try {
          await api.put(`/cvs/${cvId}/sections/${section.id}`, buildSectionUpdate(section));
        } catch (err) {
          // Web autosave: a missing section doc fails 404/500 — re-POST the same id.
          const status = axios.isAxiosError(err) ? err.response?.status : undefined;
          if (!shouldRecreateSection(status)) throw err;
          await api.post(`/cvs/${cvId}/sections`, buildSectionCreate(section));
        }
      }
      for (const id of plan.remove) {
        await api.delete(`/cvs/${cvId}/sections/${id}`);
      }

      markSectionsPersisted(snapshot.sections.map((s) => s.id));
      markSaved(snapshot.cv, snapshot.sections);
      // Cache only — a failed/slow GET must not block or look like a failed write.
      void queryClient.invalidateQueries({ queryKey: ['cvs'] });
      void queryClient.invalidateQueries({ queryKey: ['cv', cvId] });
      void queryClient.invalidateQueries({ queryKey: ['cv-sections', cvId] });
      // B7 — mid-save keystrokes leave isDirty true. Do not advance/Finish.
      return !useCVStore.getState().isDirty;
    } catch (err) {
      Alert.alert('Could not save', saveFailureMessage(err));
      return false;
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  const handleNext = async () => {
    const saved = await saveProgress();
    if (!saved) return;
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      onFinish();
    }
  };

  /** Save first (like Continue), then jump — never leaves unsaved edits behind. */
  const handleJump = async (index: number) => {
    setStepPickerOpen(false);
    if (index === currentStep) return;
    // Personal info must be valid before leaving step 1, same as Continue.
    if (currentStep === 0 && !stepValid) {
      Alert.alert('Personal Info', 'Complete the required fields before moving on.');
      return;
    }
    const saved = await saveProgress();
    if (saved) setCurrentStep(index);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const renderStep = () => {
    switch (STEPS[currentStep]?.id) {
      case 'personal': return <PersonalInfoStep onValidChange={handleValidChange} />;
      case 'experience': return <ExperienceStep onValidChange={handleValidChange} />;
      case 'education': return <EducationStep onValidChange={handleValidChange} />;
      case 'skills': return <SkillsStep onValidChange={handleValidChange} />;
      case 'summary': return <SummaryStep onValidChange={handleValidChange} />;
      case 'projects': return <ProjectsStep onValidChange={handleValidChange} />;
      case 'certifications': return <CertificationsStep onValidChange={handleValidChange} />;
      case 'languages': return <LanguagesStep onValidChange={handleValidChange} />;
      case 'references': return <ReferencesStep onValidChange={handleValidChange} />;
      case 'custom': return <CustomSectionsStep onValidChange={handleValidChange} />;
      case 'arrange': return <ArrangeSectionsStep onValidChange={handleValidChange} />;
      default: return null;
    }
  };

  const progressPercent = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <View className="flex-1 bg-stone-50">
      {/* Progress Header */}
      <View className="px-5 pt-4 pb-3 bg-white border-b border-stone-100">
        <TouchableOpacity
          onPress={() => setStepPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Step ${currentStep + 1} of ${STEPS.length}, ${STEPS[currentStep].label}. Go to another step`}
          className="flex-row items-center justify-between mb-2"
          style={{ minHeight: 32 }}
        >
          <Text className="text-sm font-semibold text-stone-600">
            Step {currentStep + 1} of {STEPS.length}
          </Text>
          <View className="flex-row items-center">
            <Text className="text-sm text-stone-500 mr-1">
              {STEPS[currentStep].label}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.stone[500]} />
          </View>
        </TouchableOpacity>
        {/* Progress bar */}
        <View className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <View
            className="h-full bg-brand-600 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </View>
      </View>

      {/* Step indicator dots */}
      <View className="flex-row justify-center gap-1.5 py-3 bg-white border-b border-stone-100">
        {STEPS.map((step, index) => (
          <View
            key={step.id}
            className={[
              'rounded-full',
              index === currentStep ? 'w-4 h-1.5 bg-brand-600' :
              index < currentStep ? 'w-1.5 h-1.5 bg-brand-300' :
              'w-1.5 h-1.5 bg-stone-200',
            ].join(' ')}
          />
        ))}
      </View>

      {/* Step Content */}
      <Animated.View
        key={currentStep}
        entering={FadeInRight.duration(200)}
        exiting={FadeOutLeft.duration(150)}
        className="flex-1"
      >
        {renderStep()}
      </Animated.View>

      <Modal visible={stepPickerOpen} onClose={() => setStepPickerOpen(false)} title="Go to step" size="lg">
        {STEPS.map((step, index) => {
          const active = index === currentStep;
          return (
            <TouchableOpacity
              key={step.id}
              onPress={() => void handleJump(index)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={[
                'flex-row items-center px-4 rounded-xl border mb-2',
                active ? 'border-brand-500 bg-brand-50' : 'border-stone-200',
              ].join(' ')}
              style={{ minHeight: 48 }}
            >
              <Ionicons name={step.icon} size={18} color={active ? colors.brand[600] : colors.stone[500]} />
              <Text className={['ml-3 flex-1', active ? 'text-brand-700 font-semibold' : 'text-stone-700'].join(' ')}>
                {index + 1}. {step.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </Modal>

      {/* Navigation Buttons */}
      <View className="flex-row gap-3 px-5 py-4 bg-white border-t border-stone-100">
        {currentStep > 0 && (
          <TouchableOpacity
            onPress={handleBack}
            className="flex-row items-center px-5 py-3 rounded-xl border border-stone-200 bg-stone-50"
          >
            <Ionicons name="chevron-back" size={18} color={colors.stone[700]} />
            <Text className="text-stone-700 font-semibold ml-1">Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleNext}
          disabled={currentStep === 0 && !stepValid}
          className={[
            'flex-1 flex-row items-center justify-center py-3 rounded-xl',
            currentStep === 0 && !stepValid ? 'bg-stone-200' : 'bg-brand-600',
          ].join(' ')}
        >
          <Text className={[
            'font-bold text-base',
            currentStep === 0 && !stepValid ? 'text-stone-400' : 'text-white',
          ].join(' ')}>
            {currentStep === STEPS.length - 1 ? 'Finish' : 'Continue'}
          </Text>
          <Ionicons
            name={currentStep === STEPS.length - 1 ? 'checkmark' : 'chevron-forward'}
            size={18}
            color={currentStep === 0 && !stepValid ? colors.stone[400] : colors.white}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}
