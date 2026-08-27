import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { api } from '../../lib/api';
import { useCVStore } from '../../store/cv-store';
import { PersonalInfoStep } from './steps/PersonalInfoStep';
import { SummaryStep } from './steps/SummaryStep';
import { ExperienceStep } from './steps/ExperienceStep';
import { EducationStep } from './steps/EducationStep';
import { SkillsStep } from './steps/SkillsStep';
import { ProjectsStep } from './steps/ProjectsStep';
import { CertificationsStep } from './steps/CertificationsStep';
import { LanguagesStep } from './steps/LanguagesStep';
import { ReferencesStep } from './steps/ReferencesStep';

const STEPS = [
  { id: 'personal', label: 'Personal Info', icon: 'person-outline' },
  { id: 'summary', label: 'Summary', icon: 'document-text-outline' },
  { id: 'experience', label: 'Experience', icon: 'briefcase-outline' },
  { id: 'education', label: 'Education', icon: 'school-outline' },
  { id: 'skills', label: 'Skills', icon: 'code-slash-outline' },
  { id: 'projects', label: 'Projects', icon: 'construct-outline' },
  { id: 'certifications', label: 'Certifications', icon: 'ribbon-outline' },
  { id: 'languages', label: 'Languages', icon: 'language-outline' },
  { id: 'references', label: 'References', icon: 'people-outline' },
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
    const newSections = snapshot.sections.filter(
      (s) => !snapshot.persistedSectionIds.includes(s.id),
    );
    const existingSections = snapshot.sections.filter(
      (s) => snapshot.persistedSectionIds.includes(s.id),
    );
    const deletedIds = snapshot.persistedSectionIds.filter(
      (id) => !snapshot.sections.some((s) => s.id === id),
    );

    try {
      // E1 — UpdateCvDto whitelist. Same subset as web cv/[id]/page.tsx autosave.
      await api.put(`/cvs/${cvId}`, {
        title: snapshot.cv.title,
        personalInfo: snapshot.cv.personalInfo,
        styling: snapshot.cv.styling,
        sectionOrder: snapshot.cv.sectionOrder,
      });

      // E3 — same order as web: POST new, PUT existing, DELETE removed.
      for (const section of newSections) {
        await api.post(`/cvs/${cvId}/sections`, {
          id: section.id,
          type: section.type,
          title: section.title,
          order: section.order,
          isVisible: section.isVisible,
          items: section.items,
        });
      }
      for (const section of existingSections) {
        await api.put(`/cvs/${cvId}/sections/${section.id}`, {
          title: section.title,
          isVisible: section.isVisible,
          items: section.items,
          order: section.order,
        });
      }
      for (const id of deletedIds) {
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

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: return <PersonalInfoStep onValidChange={handleValidChange} />;
      case 1: return <SummaryStep onValidChange={handleValidChange} />;
      case 2: return <ExperienceStep onValidChange={handleValidChange} />;
      case 3: return <EducationStep onValidChange={handleValidChange} />;
      case 4: return <SkillsStep onValidChange={handleValidChange} />;
      case 5: return <ProjectsStep onValidChange={handleValidChange} />;
      case 6: return <CertificationsStep onValidChange={handleValidChange} />;
      case 7: return <LanguagesStep onValidChange={handleValidChange} />;
      case 8: return <ReferencesStep onValidChange={handleValidChange} />;
      default: return null;
    }
  };

  const progressPercent = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <View className="flex-1 bg-stone-50">
      {/* Progress Header */}
      <View className="px-5 pt-4 pb-3 bg-white border-b border-stone-100">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-sm font-semibold text-stone-600">
            Step {currentStep + 1} of {STEPS.length}
          </Text>
          <Text className="text-sm text-stone-400">
            {STEPS[currentStep].label}
          </Text>
        </View>
        {/* Progress bar */}
        <View className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <View
            className="h-full bg-brand-500 rounded-full"
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
              index === currentStep ? 'w-4 h-1.5 bg-brand-500' :
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

      {/* Navigation Buttons */}
      <View className="flex-row gap-3 px-5 py-4 bg-white border-t border-stone-100">
        {currentStep > 0 && (
          <TouchableOpacity
            onPress={handleBack}
            className="flex-row items-center px-5 py-3 rounded-xl border border-stone-200 bg-stone-50"
          >
            <Ionicons name="chevron-back" size={18} color="#374151" />
            <Text className="text-stone-700 font-semibold ml-1">Back</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleNext}
          disabled={currentStep === 0 && !stepValid}
          className={[
            'flex-1 flex-row items-center justify-center py-3 rounded-xl',
            currentStep === 0 && !stepValid ? 'bg-stone-200' : 'bg-brand-500',
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
            color={currentStep === 0 && !stepValid ? '#a8a29e' : '#fff'}
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}
