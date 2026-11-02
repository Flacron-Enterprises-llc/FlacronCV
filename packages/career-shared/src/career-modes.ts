export type TargetTimeline =
  | 'immediate'
  | '1_to_3_months'
  | '3_to_6_months'
  | 'exploring'
  | 'not_relocating';

export type WorkAuthorization =
  | 'citizen'
  | 'permanent_resident'
  | 'visa_holder'
  | 'needs_sponsorship'
  | 'authorized';

export type RemoteFlexibility = 'remote_only' | 'hybrid' | 'onsite_only' | 'any';

export interface LocationProfile {
  id: string;
  workspaceId: string;
  candidateAuthUserId: string;
  place: string;
  radiusMiles: number;
  targetTimeline: TargetTimeline;
  isRelocation: boolean;
  workAuthorization: WorkAuthorization;
  commuteMinutesMax: number;
  remoteFlexibility: RemoteFlexibility;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLocationProfileInput {
  place: string;
  radiusMiles: number;
  targetTimeline?: TargetTimeline;
  isRelocation?: boolean;
  workAuthorization?: WorkAuthorization;
  commuteMinutesMax?: number;
  remoteFlexibility?: RemoteFlexibility;
  notes?: string | null;
}

export interface UpdateLocationProfileInput {
  place?: string;
  radiusMiles?: number;
  targetTimeline?: TargetTimeline;
  isRelocation?: boolean;
  workAuthorization?: WorkAuthorization;
  commuteMinutesMax?: number;
  remoteFlexibility?: RemoteFlexibility;
  notes?: string | null;
}

export type SpecialistMode =
  | 'general'
  | 'technical_engineering'
  | 'executive_leadership'
  | 'creative_design'
  | 'academic_research'
  | 'career_transition';

export interface CandidateSpecialistMode {
  candidateAuthUserId: string;
  workspaceId: string;
  mode: SpecialistMode;
  focusAreas: string[];
  customGuidelines: string | null;
  updatedAt: string;
}

export interface UpdateSpecialistModeInput {
  mode: SpecialistMode;
  focusAreas?: string[];
  customGuidelines?: string | null;
}

export interface SpecialistModeMetadata {
  id: SpecialistMode;
  name: string;
  description: string;
  recommendedFocus: string[];
  promptModifier: string;
}

export const SPECIALIST_MODES: Record<SpecialistMode, SpecialistModeMetadata> = {
  general: {
    id: 'general',
    name: 'Standard Professional',
    description: 'Balanced presentation across functional skills, career trajectory, and practical outcomes.',
    recommendedFocus: ['Core Competencies', 'Key Achievements', 'Team Collaboration'],
    promptModifier: 'Emphasize verified outcomes, clarity of impact, and strong functional mastery.',
  },
  technical_engineering: {
    id: 'technical_engineering',
    name: 'Technical & Engineering',
    description: 'Prioritizes architecture decisions, scale, technical stack depth, and quantitative performance.',
    recommendedFocus: ['System Architecture', 'Language & Framework Depth', 'Scale & Latency Metrics', 'Open Source'],
    promptModifier: 'Focus on technical rigor, system complexity, reliability metrics, and concrete engineering decisions.',
  },
  executive_leadership: {
    id: 'executive_leadership',
    name: 'Executive & Leadership',
    description: 'Highlights P&L ownership, organizational transformation, board interactions, and executive vision.',
    recommendedFocus: ['P&L Management', 'Organizational Scaling', 'Strategic Roadmaps', 'Stakeholder Alignment'],
    promptModifier: 'Frame experiences through strategic leadership, revenue growth, talent development, and governance.',
  },
  creative_design: {
    id: 'creative_design',
    name: 'Creative & Design',
    description: 'Centers on product empathy, portfolio case studies, user research methodologies, and brand craft.',
    recommendedFocus: ['Design Systems', 'User Research & Discovery', 'Case Studies', 'Cross-functional Critique'],
    promptModifier: 'Highlight design process, user problem framing, prototyping craft, and business metric impact.',
  },
  academic_research: {
    id: 'academic_research',
    name: 'Academic & Research',
    description: 'Emphasizes peer-reviewed publications, grant awards, teaching, and experimental methodology.',
    recommendedFocus: ['Peer-reviewed Publications', 'Grant Funding', 'Lab Direction', 'Conference Proceedings'],
    promptModifier: 'Highlight research methodology, citation impact, grant management, and theoretical contributions.',
  },
  career_transition: {
    id: 'career_transition',
    name: 'Career Pivot / Entry',
    description: 'Bridges transferable capabilities from prior domains into target industries with focused narratives.',
    recommendedFocus: ['Transferable Skills', 'Rapid Upskilling Evidence', 'Domain Analogies', 'Self-directed Projects'],
    promptModifier: 'Translate previous domain expertise into target industry language with clear evidence of rapid mastery.',
  },
};

/**
 * Validates requested radius against plan limits.
 * Free: 25 mi, Starter: 50 mi, Professional: 100 mi, Career Pro / Business: 200 mi.
 */
export function validateRadiusLimit(
  requestedRadius: number,
  allowedRadiusMiles: number,
): { valid: boolean; maxAllowed: number } {
  const valid = requestedRadius >= 0 && requestedRadius <= allowedRadiusMiles;
  return { valid, maxAllowed: allowedRadiusMiles };
}
