'use client';
import React from 'react';
import type { CoverLetter } from '@flacroncv/shared-types';
import ClassicTemplate    from './templates/ClassicTemplate';
import ModernTemplate     from './templates/ModernTemplate';
import MinimalistTemplate from './templates/MinimalistTemplate';
import CreativeTemplate   from './templates/CreativeTemplate';
import CorporateTemplate  from './templates/CorporateTemplate';
import ExecutiveTemplate  from './templates/ExecutiveTemplate';

interface Props {
  coverLetter: CoverLetter;
  senderName?: string;
  senderEmail?: string;
}

const TEMPLATES = {
  classic:    ClassicTemplate,
  modern:     ModernTemplate,
  minimalist: MinimalistTemplate,
  creative:   CreativeTemplate,
  corporate:  CorporateTemplate,
  executive:  ExecutiveTemplate,
  standard:   ModernTemplate, // default alias
};

export const COVER_LETTER_TEMPLATES = [
  { id: 'classic',    name: 'Classic',    description: 'Traditional business letter', defaultColor: '#1e3a5f' },
  { id: 'modern',     name: 'Modern',     description: 'Bold colored header',          defaultColor: '#2563eb' },
  { id: 'minimalist', name: 'Minimalist', description: 'Clean & spacious',             defaultColor: '#374151' },
  { id: 'creative',   name: 'Creative',   description: 'Side accent + vivid color',    defaultColor: '#7c3aed' },
  { id: 'corporate',  name: 'Corporate',  description: 'Formal letterhead style',      defaultColor: '#0f766e' },
  { id: 'executive',  name: 'Executive',  description: 'Premium right-aligned header', defaultColor: '#0c0c0c' },
];

export default function CoverLetterPreview({ coverLetter, senderName, senderEmail }: Props) {
  const templateId = coverLetter.templateId || 'modern';
  const Template = (TEMPLATES as any)[templateId] ?? ModernTemplate;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div id="cl-preview-content">
      <Template
        coverLetter={coverLetter}
        senderName={senderName}
        senderEmail={senderEmail}
        today={today}
      />
    </div>
  );
}
