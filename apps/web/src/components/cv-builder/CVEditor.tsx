'use client';

import { useCVStore } from '@/store/cv-store';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  ChevronDown,
  ChevronRight,
  Plus,
  User,
  X,
  Camera,
} from 'lucide-react';
import { useState, useRef } from 'react';
import { CVSection, CVSectionType, CVSectionItem, SkillLevel } from '@flacroncv/shared-types';
import { cn } from '@/lib/utils';

export default function CVEditor() {
  const t = useTranslations('cv_builder');
  const { cv, sections, updatePersonalInfo, updateStyling, reorderSections, pushHistory } = useCVStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 400;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * ratio);
        canvas.height = Math.round(img.height * ratio);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const resized = canvas.toDataURL('image/jpeg', 0.88);
        updatePersonalInfo('photoURL', resized);
        updateStyling('showPhoto', true);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removePhoto = () => {
    updatePersonalInfo('photoURL', '');
    updateStyling('showPhoto', false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    const newOrder = arrayMove(
      sections.map((s) => s.id),
      oldIndex,
      newIndex,
    );
    pushHistory();
    reorderSections(newOrder);
  };

  if (!cv) return null;

  return (
    <div className="space-y-4">
      {/* Personal Info Section */}
      <Card>
        <h3 className="mb-4 font-semibold text-stone-900 dark:text-white">{t('personal_info')}</h3>

        {/* Photo upload */}
        <div className="mb-4 flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative h-20 w-20 overflow-hidden rounded-full border-2 border-dashed border-stone-300 bg-stone-100 transition-colors hover:border-brand-400 hover:bg-stone-200 dark:border-stone-600 dark:bg-stone-700 dark:hover:border-brand-500"
            >
              {cv.personalInfo.photoURL ? (
                <>
                  <img src={cv.personalInfo.photoURL} alt="Profile" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                </>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                  <User className="h-7 w-7 text-stone-400" />
                  <Camera className="h-3.5 w-3.5 text-stone-400" />
                </div>
              )}
            </button>
            {cv.personalInfo.photoURL && (
              <button
                type="button"
                onClick={removePhoto}
                className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white shadow hover:bg-red-600"
                title="Remove photo"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300"
            >
              {cv.personalInfo.photoURL ? 'Change photo' : 'Upload photo'}
            </button>
            <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
              JPG or PNG · Used as your CV avatar
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="First Name"
            value={cv.personalInfo.firstName}
            onChange={(e) => updatePersonalInfo('firstName', e.target.value)}
            placeholder="Your first name"
          />
          <Input
            label="Last Name"
            value={cv.personalInfo.lastName}
            onChange={(e) => updatePersonalInfo('lastName', e.target.value)}
            placeholder="Your last name"
          />
          <Input
            label="Email"
            type="email"
            value={cv.personalInfo.email}
            onChange={(e) => updatePersonalInfo('email', e.target.value)}
          />
          <Input
            label="Phone"
            value={cv.personalInfo.phone}
            onChange={(e) => updatePersonalInfo('phone', e.target.value)}
          />
          <Input
            label="City"
            value={cv.personalInfo.city}
            onChange={(e) => updatePersonalInfo('city', e.target.value)}
          />
          <Input
            label="Country"
            value={cv.personalInfo.country}
            onChange={(e) => updatePersonalInfo('country', e.target.value)}
          />
          <div className="sm:col-span-2">
            <Input
              label="Professional Headline"
              value={cv.personalInfo.headline}
              onChange={(e) => updatePersonalInfo('headline', e.target.value)}
              placeholder="e.g. Senior Software Engineer"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
              Professional Summary
            </label>
            <textarea
              className="input-field min-h-[100px] resize-y"
              value={cv.personalInfo.summary}
              onChange={(e) => updatePersonalInfo('summary', e.target.value)}
              placeholder="A brief overview of your professional background..."
            />
          </div>
          <Input
            label="LinkedIn"
            value={cv.personalInfo.linkedin}
            onChange={(e) => updatePersonalInfo('linkedin', e.target.value)}
            placeholder="linkedin.com/in/yourname"
          />
          <Input
            label="Website"
            value={cv.personalInfo.website}
            onChange={(e) => updatePersonalInfo('website', e.target.value)}
            placeholder="yoursite.com"
          />
        </div>
      </Card>

      {/* Draggable Sections */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {sections.map((section) => (
            <SortableSection key={section.id} section={section} />
          ))}
        </SortableContext>
      </DndContext>

      {/* Add Section */}
      <AddSectionButton />
    </div>
  );
}

function SortableSection({ section }: { section: CVSection }) {
  const t = useTranslations('cv_builder');
  const { updateSection, removeSection, pushHistory } = useCVStore();
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-800',
        isDragging && 'opacity-50 shadow-lg',
      )}
    >
      {/* Section header */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-stone-400 hover:bg-stone-100 active:cursor-grabbing dark:hover:bg-stone-700"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-start">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-stone-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-stone-400" />
            )}
            <span className="text-sm font-semibold text-stone-900 dark:text-white">
              {section.title}
            </span>
            <span className="text-xs text-stone-400">({section.items.length} items)</span>
          </div>
        </button>

        <button
          onClick={() => updateSection(section.id, { isVisible: !section.isVisible })}
          className="rounded p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700"
          title={section.isVisible ? 'Hide' : 'Show'}
        >
          {section.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>

        <button
          onClick={() => { pushHistory(); removeSection(section.id); }}
          className="rounded p-1 text-stone-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
          title={t('remove_section')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Section content */}
      {expanded && (
        <div className="border-t border-stone-200 px-4 py-3 dark:border-stone-700">
          <SectionContent section={section} />
        </div>
      )}
    </div>
  );
}

function SectionContent({ section }: { section: CVSection }) {
  const { updateSection, pushHistory } = useCVStore();

  const addItem = () => {
    pushHistory();
    const newItem = createDefaultItem(section.type);
    updateSection(section.id, { items: [...section.items, newItem] });
  };

  const updateItem = (index: number, data: Record<string, unknown>) => {
    const newItems = [...section.items];
    newItems[index] = { ...newItems[index], ...data } as any;
    updateSection(section.id, { items: newItems });
  };

  const removeItem = (index: number) => {
    pushHistory();
    const newItems = section.items.filter((_, i) => i !== index);
    updateSection(section.id, { items: newItems });
  };

  return (
    <div className="space-y-3">
      {section.items.map((item: any, index: number) => (
        <div key={item.id || index} className="rounded-lg border border-stone-100 p-3 dark:border-stone-700">
          {section.type === 'experience' && (
            <div className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Input label="Position" value={item.position || ''} onChange={(e) => updateItem(index, { position: e.target.value })} />
                <Input label="Company" value={item.company || ''} onChange={(e) => updateItem(index, { company: e.target.value })} />
                <Input label="Start Date" value={item.startDate || ''} onChange={(e) => updateItem(index, { startDate: e.target.value })} placeholder="2023-01" />
                <Input label="End Date" value={item.endDate || ''} onChange={(e) => updateItem(index, { endDate: e.target.value })} placeholder="Present" />
              </div>
              <textarea className="input-field min-h-[60px]" value={item.description || ''} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Describe your responsibilities and achievements..." />
            </div>
          )}
          {section.type === 'education' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input label="Degree" value={item.degree || ''} onChange={(e) => updateItem(index, { degree: e.target.value })} />
              <Input label="Field of Study" value={item.field || ''} onChange={(e) => updateItem(index, { field: e.target.value })} />
              <Input label="Institution" value={item.institution || ''} onChange={(e) => updateItem(index, { institution: e.target.value })} />
              <Input label="Start - End" value={item.startDate || ''} onChange={(e) => updateItem(index, { startDate: e.target.value })} placeholder="2019 - 2023" />
            </div>
          )}
          {section.type === 'skills' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input label="Skill" value={item.name || ''} onChange={(e) => updateItem(index, { name: e.target.value })} />
              <select
                className="input-field"
                value={item.level || 'intermediate'}
                onChange={(e) => updateItem(index, { level: e.target.value })}
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="expert">Expert</option>
              </select>
            </div>
          )}
          {!['experience', 'education', 'skills'].includes(section.type) && (
            <div className="space-y-2">
              <Input label="Title" value={item.name || item.title || ''} onChange={(e) => updateItem(index, { name: e.target.value, title: e.target.value })} />
              <textarea className="input-field min-h-[40px]" value={item.description || ''} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Description..." />
            </div>
          )}
          <button
            onClick={() => removeItem(index)}
            className="mt-2 text-xs text-red-500 hover:text-red-700"
          >
            Remove
          </button>
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={<Plus className="h-3 w-3" />} onClick={addItem}>
        Add Item
      </Button>
    </div>
  );
}

function AddSectionButton() {
  const t = useTranslations('cv_builder');
  const { addSection, pushHistory } = useCVStore();
  const [open, setOpen] = useState(false);

  const sectionTypes = [
    { type: CVSectionType.EXPERIENCE, label: t('experience') },
    { type: CVSectionType.EDUCATION, label: t('education') },
    { type: CVSectionType.SKILLS, label: t('skills') },
    { type: CVSectionType.PROJECTS, label: t('projects') },
    { type: CVSectionType.CERTIFICATIONS, label: t('certifications') },
    { type: CVSectionType.LANGUAGES, label: t('languages') },
    { type: CVSectionType.REFERENCES, label: t('references') },
    { type: CVSectionType.CUSTOM, label: t('custom') },
  ];

  const handleAdd = (type: CVSectionType, label: string) => {
    pushHistory();
    addSection({
      id: crypto.randomUUID(),
      type,
      title: label,
      isVisible: true,
      order: 999,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    setOpen(false);
  };

  return (
    <div className="relative">
      <Button variant="secondary" className="w-full" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(!open)}>
        {t('add_section')}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute bottom-full z-20 mb-2 w-full rounded-xl border border-stone-200 bg-white p-2 shadow-xl dark:border-stone-700 dark:bg-stone-800">
            <div className="grid grid-cols-2 gap-1">
              {sectionTypes.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => handleAdd(type, label)}
                  className="rounded-lg px-3 py-2 text-start text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-700"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function createDefaultItem(type: string): CVSectionItem {
  const id = crypto.randomUUID();
  switch (type) {
    case 'experience':
      return { id, company: '', position: '', location: '', startDate: '', endDate: null, isCurrent: false, description: '', highlights: [], order: 0 };
    case 'education':
      return { id, institution: '', degree: '', field: '', location: '', startDate: '', endDate: null, gpa: '', description: '', order: 0 };
    case 'skills':
      return { id, name: '', level: SkillLevel.INTERMEDIATE, category: '', order: 0 };
    case 'projects':
      return { id, name: '', description: '', url: '', technologies: [], startDate: '', endDate: null, order: 0 };
    case 'certifications':
      return { id, name: '', issuer: '', date: '', expiryDate: null, credentialId: '', url: '', order: 0 };
    case 'languages':
      return { id, name: '', proficiency: '', order: 0 };
    case 'references':
      return { id, name: '', title: '', company: '', email: '', phone: '', relationship: '', order: 0 };
    default:
      return { id, title: '', subtitle: '', date: '', description: '', order: 0 };
  }
}
