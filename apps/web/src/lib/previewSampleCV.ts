/**
 * Realistic sample CV used exclusively for template preview rendering.
 * Never persisted — consumed only by TemplatePreviewModal.
 */

import type { CV, CVSection, CVLayout } from '@flacroncv/shared-types';
import { CVStatus, CVSectionType, SkillLevel, FontSize, Spacing } from '@flacroncv/shared-types';

const now = new Date();

export function buildSampleCV(layout: CVLayout, accentColor: string): CV {
  return {
    id:            'preview',
    userId:        'preview',
    title:         'Sample CV',
    slug:          'preview',
    templateId:    'preview',
    status:        CVStatus.DRAFT,
    isPublic:      false,
    publicSlug:    null,
    version:       1,
    lastAutoSavedAt: now,
    aiGenerated:   false,
    aiProvider:    null,
    viewCount:     0,
    downloadCount: 0,
    createdAt:     now,
    updatedAt:     now,
    deletedAt:     null,
    sectionOrder:  ['exp', 'edu', 'skills', 'certs', 'langs'],
    styling: {
      primaryColor:       accentColor,
      fontFamily:         'Inter',
      headingFontFamily:  'Inter',
      fontSize:           FontSize.MEDIUM,
      spacing:            Spacing.NORMAL,
      showPhoto:          false,
      layout,
      sectionStyle:       'underline',
      borderRadius:       'small',
    },
    personalInfo: {
      firstName:  'Alexandra',
      lastName:   'Chen',
      email:      'alex.chen@example.com',
      phone:      '+1 (555) 234-5678',
      address:    '',
      city:       'San Francisco',
      country:    'United States',
      postalCode: '',
      website:    'alexchen.dev',
      linkedin:   'linkedin.com/in/alexchen',
      github:     'github.com/alexchen',
      photoURL:   null,
      headline:   'Senior Product Manager',
      summary:
        'Results-driven Product Manager with 7+ years of experience leading cross-functional teams to deliver high-impact digital products. Proven track record of 0→1 launches, data-informed roadmap prioritisation, and aligning engineering, design, and business stakeholders.',
    },
  };
}

export const SAMPLE_SECTIONS: CVSection[] = [
  {
    id:        'exp',
    type:      CVSectionType.EXPERIENCE,
    title:     'Experience',
    isVisible: true,
    order:     0,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id:          'e1',
        company:     'Stripe',
        position:    'Senior Product Manager',
        location:    'San Francisco, CA',
        startDate:   '2021-03',
        endDate:     null,
        isCurrent:   true,
        description:
          'Led the end-to-end redesign of the merchant dashboard, reducing time-to-first-transaction by 38%. Managed a squad of 12 engineers and 3 designers across 4 time zones.',
        highlights:  [],
        order:       0,
      },
      {
        id:          'e2',
        company:     'Airbnb',
        position:    'Product Manager',
        location:    'San Francisco, CA',
        startDate:   '2018-06',
        endDate:     '2021-02',
        isCurrent:   false,
        description:
          'Owned the host onboarding funnel, increasing host activation rates by 22% through a targeted A/B testing programme and iterative UX improvements.',
        highlights:  [],
        order:       1,
      },
      {
        id:          'e3',
        company:     'Google',
        position:    'Associate Product Manager',
        location:    'Mountain View, CA',
        startDate:   '2016-09',
        endDate:     '2018-05',
        isCurrent:   false,
        description:
          'Contributed to Google Maps local search features, coordinating cross-functional efforts across data science, legal, and marketing.',
        highlights:  [],
        order:       2,
      },
    ] as any,
  },
  {
    id:        'edu',
    type:      CVSectionType.EDUCATION,
    title:     'Education',
    isVisible: true,
    order:     1,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      {
        id:          'ed1',
        institution: 'Stanford University',
        degree:      'M.S.',
        field:       'Computer Science',
        location:    'Stanford, CA',
        startDate:   '2014-09',
        endDate:     '2016-06',
        gpa:         '3.9',
        description: 'Specialisation in Human-Computer Interaction. Graduate Research Award 2016.',
        order:       0,
      },
      {
        id:          'ed2',
        institution: 'UC Berkeley',
        degree:      'B.S.',
        field:       'Electrical Engineering & Computer Science',
        location:    'Berkeley, CA',
        startDate:   '2010-09',
        endDate:     '2014-05',
        gpa:         '3.8',
        description: '',
        order:       1,
      },
    ] as any,
  },
  {
    id:        'skills',
    type:      CVSectionType.SKILLS,
    title:     'Skills',
    isVisible: true,
    order:     2,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      { id: 's1', name: 'Product Strategy',   level: SkillLevel.EXPERT,        category: '', order: 0 },
      { id: 's2', name: 'Agile / Scrum',       level: SkillLevel.EXPERT,        category: '', order: 1 },
      { id: 's3', name: 'SQL & Analytics',     level: SkillLevel.INTERMEDIATE,  category: '', order: 2 },
      { id: 's4', name: 'Figma',               level: SkillLevel.INTERMEDIATE,  category: '', order: 3 },
      { id: 's5', name: 'A/B Testing',         level: SkillLevel.EXPERT,        category: '', order: 4 },
      { id: 's6', name: 'Stakeholder Mgmt',    level: SkillLevel.EXPERT,        category: '', order: 5 },
      { id: 's7', name: 'Go-to-Market',        level: SkillLevel.INTERMEDIATE,  category: '', order: 6 },
      { id: 's8', name: 'Python',              level: SkillLevel.BEGINNER,      category: '', order: 7 },
    ] as any,
  },
  {
    id:        'certs',
    type:      CVSectionType.CERTIFICATIONS,
    title:     'Certifications',
    isVisible: true,
    order:     3,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      { id: 'c1', name: 'AWS Certified Cloud Practitioner', issuer: 'Amazon Web Services', date: '2023-04', expiryDate: null, credentialId: '', url: '', order: 0 },
      { id: 'c2', name: 'Professional Scrum Master I',      issuer: 'Scrum.org',            date: '2020-11', expiryDate: null, credentialId: '', url: '', order: 1 },
    ] as any,
  },
  {
    id:        'langs',
    type:      CVSectionType.LANGUAGES,
    title:     'Languages',
    isVisible: true,
    order:     4,
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [
      { id: 'l1', name: 'English',  proficiency: 'Native',       order: 0 },
      { id: 'l2', name: 'Mandarin', proficiency: 'Fluent',        order: 1 },
      { id: 'l3', name: 'French',   proficiency: 'Intermediate',  order: 2 },
    ] as any,
  },
];
