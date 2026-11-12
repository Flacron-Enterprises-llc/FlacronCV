import { useState } from 'react';
import { useCVStore } from '../../store/cv-store';
import { CVSection } from '../../types/cv.types';
import { CVSectionType } from '../../types/enums';
import { sectionsOfType } from '../../lib/cv-editor';

/**
 * The section a type step edits. A CV made on the website can hold several
 * sections of one type (web "Add Section" allows duplicates); the step edits
 * the selected one and `SectionSwitcher` lets the user pick another.
 */
export function useStepSection(type: CVSectionType): {
  section: CVSection | undefined;
  sectionsForType: CVSection[];
  selectSection: (id: string) => void;
} {
  const sections = useCVStore((s) => s.sections);
  const sectionsForType = sectionsOfType(sections, type);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const section =
    sectionsForType.find((s) => s.id === selectedId) ?? sectionsForType[0];
  return { section, sectionsForType, selectSection: setSelectedId };
}
