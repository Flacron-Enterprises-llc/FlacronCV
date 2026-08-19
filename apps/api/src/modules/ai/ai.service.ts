import { Injectable, ServiceUnavailableException, Logger } from '@nestjs/common';
import { OpenAIProvider } from './providers/openai.provider';
import { IAIProvider, AIProviderOptions, AIProviderResponse } from './providers/ai-provider.interface';
import { UsersService } from '../users/users.service';
import { AbuseService } from '../abuse/abuse.service';

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

/** How long a generated cover letter should be. */
export type CoverLetterLength = 'short' | 'medium' | 'long';

/**
 * Length presets for `generateCoverLetter`.
 *
 * `maxTokens` is the *budget*, not the target — the prompt guidance is what
 * actually shapes the output; the budget only stops a "long" request being
 * truncated and stops a "short" one paying for tokens it will never use. All
 * three sit below AIService.MAX_OUTPUT_TOKENS so the clamp stays a ceiling
 * rather than the thing choosing the value.
 */
const COVER_LETTER_LENGTHS: Record<
  CoverLetterLength,
  { maxTokens: number; label: string; guidance: string }
> = {
  short: {
    maxTokens: 600,
    label: 'short (about 150-200 words)',
    guidance:
      '- Keep it SHORT: 3 tight paragraphs, roughly 150-200 words in total\n' +
      '- One opening, ONE body paragraph with a single strongest example, one closing\n' +
      '- Cut anything that is not directly relevant to the job requirements',
  },
  medium: {
    maxTokens: 1000,
    label: 'medium (about 300-400 words)',
    guidance:
      '- Aim for a MEDIUM length: 3-4 paragraphs, roughly 300-400 words in total\n' +
      '- Opening, 2 body paragraphs with specific examples, closing',
  },
  long: {
    maxTokens: 1500,
    label: 'long (about 500-600 words)',
    guidance:
      '- Write a LONG, detailed letter: 5 paragraphs, roughly 500-600 words in total\n' +
      '- Opening, 3 body paragraphs each developing a different, specific example, closing\n' +
      '- Go deeper on context and outcomes, but never pad with generic filler',
  },
};

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private providers: IAIProvider[];
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  private readonly FAILURE_THRESHOLD = 3;
  private readonly RESET_TIMEOUT = 60000; // 60 seconds
  private readonly MAX_OUTPUT_TOKENS = 2048; // server ceiling for caller-supplied maxTokens

  constructor(
    private openaiProvider: OpenAIProvider,
    private usersService: UsersService,
    private abuse: AbuseService,
  ) {
    this.providers = [this.openaiProvider];
    this.providers.forEach((p) => {
      this.circuitBreakers.set(p.name, { failures: 0, lastFailure: 0, isOpen: false });
    });
    // Log provider availability at startup
    this.openaiProvider.isAvailable().then((ok) => {
      if (ok) {
        this.logger.log('OpenAI provider ready');
      } else {
        this.logger.error('OpenAI provider NOT available — OPENAI_API_KEY is missing or empty');
      }
    });
  }

  private isCircuitOpen(providerName: string): boolean {
    const state = this.circuitBreakers.get(providerName)!;
    if (!state.isOpen) return false;

    // Check if reset timeout has passed
    if (Date.now() - state.lastFailure > this.RESET_TIMEOUT) {
      state.isOpen = false;
      state.failures = 0;
      this.logger.log(`Circuit breaker reset for ${providerName}`);
      return false;
    }

    return true;
  }

  private recordSuccess(providerName: string): void {
    const state = this.circuitBreakers.get(providerName)!;
    state.failures = 0;
    state.isOpen = false;
  }

  private recordFailure(providerName: string): void {
    const state = this.circuitBreakers.get(providerName)!;
    state.failures++;
    state.lastFailure = Date.now();
    if (state.failures >= this.FAILURE_THRESHOLD) {
      state.isOpen = true;
      this.logger.warn(`Circuit breaker OPEN for ${providerName}`);
    }
  }

  /**
   * Coerce + clamp caller-supplied generation params to safe server bounds. The
   * raw /ai/generate endpoint lets a user set maxTokens/temperature; clamping
   * here (a) caps per-call output cost and (b) — critically — keeps out-of-range
   * values from reaching the provider, since an out-of-range param is a
   * deterministic 400 that would otherwise trip the SHARED circuit breaker and
   * take AI down for every tenant. The model is never taken from the caller.
   */
  private clampOptions(options: Partial<AIProviderOptions>): AIProviderOptions {
    const rawMax = Number(options.maxTokens);
    const maxTokens = Number.isFinite(rawMax)
      ? Math.min(Math.max(Math.trunc(rawMax), 1), this.MAX_OUTPUT_TOKENS)
      : 1024;
    const rawTemp = Number(options.temperature);
    const temperature = Number.isFinite(rawTemp) ? Math.min(Math.max(rawTemp, 0), 2) : 0.7;
    return { maxTokens, temperature };
  }

  /** OpenAI (and most providers) throw an APIError carrying an HTTP `status`. */
  private isClientInputError(error: unknown): boolean {
    const status = (error as { status?: number })?.status;
    return typeof status === 'number' && status >= 400 && status < 500;
  }

  async generate(
    prompt: string,
    options: Partial<AIProviderOptions> = {},
    userId?: string,
  ): Promise<AIProviderResponse> {
    // Atomically RESERVE a credit up front (transaction: check + increment in one
    // commit) so concurrent requests can't all pass a stale check and overshoot
    // the plan cap (TOCTOU). Refunded in `finally` if no provider succeeds, so a
    // failed generation still costs nothing.
    let creditReserved = false;
    if (userId) {
      await this.abuse.assertNewConsumption(userId, 'ai');
      const ok = await this.usersService.reserveAiCredit(userId);
      if (!ok) {
        throw new ServiceUnavailableException('AI credits exhausted. Please upgrade your plan.');
      }
      creditReserved = true;
    }

    const fullOptions: AIProviderOptions = this.clampOptions(options);

    try {
      for (const provider of this.providers) {
        if (this.isCircuitOpen(provider.name)) {
          this.logger.debug(`Skipping ${provider.name} (circuit open)`);
          continue;
        }

        const available = await provider.isAvailable();
        if (!available) {
          this.logger.warn(`Skipping ${provider.name} — API key not configured (check OPENAI_API_KEY env var)`);
          continue;
        }

        try {
          const result = await provider.generateText(prompt, fullOptions);

          if (!result.content?.trim()) {
            this.logger.warn(`${provider.name} returned empty content — treating as failure`);
            this.recordFailure(provider.name);
            continue;
          }

          this.recordSuccess(provider.name);
          // Success → the reserved credit is genuinely consumed; don't refund it.
          creditReserved = false;

          this.logger.log(`Generated via ${provider.name} in ${result.latencyMs}ms (${result.content.length} chars)`);
          return result;
        } catch (error) {
          // Only count genuine provider failures (5xx / network / timeout) toward
          // the breaker. A 4xx is caller-input error and must NOT open a shared
          // breaker that would deny AI to every other tenant.
          if (!this.isClientInputError(error)) {
            this.recordFailure(provider.name);
          }
          this.logger.error(`${provider.name} failed`);
        }
      }

      throw new ServiceUnavailableException('AI generation failed');
    } finally {
      // Reserved but never produced a result → give the credit back.
      if (creditReserved && userId) {
        try {
          await this.usersService.refundAiCredit(userId);
        } catch (err) {
          this.logger.error(`Failed to refund AI credit for ${userId}: ${(err as Error).message}`);
        }
      }
    }
  }

  async generateCVSummary(
    experience: string,
    skills: string,
    targetRole: string,
    userId?: string,
    language: string = 'English',
  ): Promise<AIProviderResponse> {
    const prompt = `Write a compelling professional summary for a CV/resume.

Target Role: ${targetRole}
Key Experience: ${experience}
Key Skills: ${skills}
Output Language: ${language}

Requirements:
- 3-4 sentences maximum
- Use strong action verbs
- Highlight key achievements and expertise
- Make it ATS-friendly
- Professional tone
- Write the entire summary in ${language}

Return ONLY the summary text in ${language}, no labels or headers.`;

    return this.generate(prompt, { maxTokens: 300, temperature: 0.7 }, userId);
  }

  async improveSection(
    sectionType: string,
    content: string,
    userId?: string,
    language: string = 'English',
  ): Promise<AIProviderResponse> {
    const prompt = `Improve the following ${sectionType} section from a CV/resume.

Current content:
${content}

Output Language: ${language}

Requirements:
- Use strong action verbs
- Quantify achievements where possible (add realistic metrics)
- Make it more impactful and professional
- Keep the same structure but enhance the language
- Make it ATS-friendly
- Write the improved content in ${language}

Return ONLY the improved content in ${language}, maintaining the same format.`;

    return this.generate(prompt, { maxTokens: 800, temperature: 0.6 }, userId);
  }

  async suggestSkills(
    experience: string,
    currentSkills: string,
    userId?: string,
  ): Promise<AIProviderResponse> {
    const prompt = `Based on the following work experience, suggest relevant skills to add to a CV.

Experience:
${experience}

Current Skills:
${currentSkills}

Suggest 10-15 additional relevant skills that would strengthen this CV.
Format: Return as a JSON array of strings, e.g. ["Skill 1", "Skill 2", ...]`;

    return this.generate(prompt, { maxTokens: 500, temperature: 0.5 }, userId);
  }

  /**
   * Normalise a caller-supplied length. The value reaches us straight from a
   * request body on the untyped `/ai/cover-letter` route, so anything that is
   * not one of the three known keys falls back to `medium` rather than being
   * interpolated into the prompt or used to pick a token budget.
   */
  private resolveLength(length?: string): (typeof COVER_LETTER_LENGTHS)[CoverLetterLength] {
    const key = String(length ?? '').toLowerCase() as CoverLetterLength;
    return COVER_LETTER_LENGTHS[key] ?? COVER_LETTER_LENGTHS.medium;
  }

  /**
   * @param length short / medium / long. Defaults to `medium`, so callers that
   *   never pass it (e.g. CoverLetterService) keep working unchanged.
   */
  async generateCoverLetter(
    jobTitle: string,
    jobDescription: string,
    companyName: string,
    candidateProfile: string,
    tone: string,
    userId?: string,
    language: string = 'English',
    length?: string,
  ): Promise<AIProviderResponse> {
    const size = this.resolveLength(length);

    const prompt = `Write a compelling, professional cover letter that demonstrates a strong fit for this position.

Job Title: ${jobTitle}
Company: ${companyName}
Job Description: ${jobDescription}

Candidate Profile:
${candidateProfile}

Tone: ${tone}
Length: ${size.label}
Output Language: ${language}

Requirements:
- Write in FIRST PERSON (I, my, me) - this is from the candidate's perspective
- Professional ${tone} tone throughout
${size.guidance}
- Separate every paragraph with a blank line
- Strong opening that expresses genuine interest in the role and company
- Include SPECIFIC examples from the candidate's experience that directly relate to job requirements
- Connect the candidate's skills and achievements to the company's needs
- Avoid generic statements - be specific and concrete using information from the candidate profile
- NO placeholder text like [Name], [Date], [Company], etc. - use actual values provided
- Compelling closing that invites further discussion
- Write the ENTIRE cover letter in ${language}
- Return ONLY the cover letter body text in ${language} (no date, address headers, or signature)

The cover letter should tell a cohesive story about why this candidate is an excellent fit for this specific role.`;

    return this.generate(prompt, { maxTokens: size.maxTokens, temperature: 0.7 }, userId);
  }

  /**
   * Rewrite ONE paragraph of an existing cover letter, leaving the rest alone.
   *
   * The whole letter is sent as read-only context so the replacement keeps the
   * letter's voice, tone and language and does not repeat a point made in a
   * neighbouring paragraph — but the model is asked to return only the single
   * rewritten paragraph, which is all the editor substitutes back in.
   *
   * Inputs are truncated before they reach the prompt: the letter arrives from
   * a rich-text editor and could otherwise be arbitrarily large, and prompt
   * size is real money on every call.
   */
  async regenerateParagraph(
    letter: string,
    paragraph: string,
    userId?: string,
    language: string = 'English',
  ): Promise<AIProviderResponse> {
    const context = letter.slice(0, 8000);
    const target = paragraph.slice(0, 2000);

    // Give the rewrite room to breathe (~2.5x the original) without letting a
    // long paragraph buy an unbounded budget. `generate` clamps again anyway.
    const maxTokens = Math.min(1200, Math.max(300, Math.ceil((target.length / 4) * 2.5) + 120));

    const prompt = `You are editing a single paragraph of an existing cover letter.

FULL COVER LETTER (context only - do NOT rewrite or return this):
"""
${context}
"""

PARAGRAPH TO REWRITE:
"""
${target}
"""

Requirements:
- Return ONLY the rewritten paragraph - no preamble, no quotes, no labels, no other paragraphs
- Output a single paragraph
- Write it in ${language}, matching the language and first-person voice of the letter above
- Match the tone and register of the surrounding paragraphs exactly
- Keep it close to the original length (within about 25%) so the letter stays balanced
- Improve clarity and impact; make it specific rather than generic
- Do NOT repeat points already made in the other paragraphs, and do not contradict them
- Do NOT invent employers, dates, qualifications or metrics that are not already in the letter
- NO placeholder text like [Name], [Date] or [Company]`;

    return this.generate(prompt, { maxTokens, temperature: 0.7 }, userId);
  }

  async translateContent(
    content: string,
    targetLanguage: string,
    userId?: string,
  ): Promise<AIProviderResponse> {
    const prompt = `Translate the following CV/resume content to ${targetLanguage}.
Maintain professional tone and formatting. Keep technical terms in English where appropriate.

Content:
${content}

Return ONLY the translated text.`;

    return this.generate(prompt, { maxTokens: 2000, temperature: 0.3 }, userId);
  }

  async generateJobDescription(
    jobTitle: string,
    companyName?: string,
    userId?: string,
    language: string = 'English',
  ): Promise<AIProviderResponse> {
    const companyContext = companyName ? `for ${companyName}` : '';
    const prompt = `Generate a realistic and comprehensive job description for the position of "${jobTitle}" ${companyContext}.

Output Language: ${language}

Requirements:
- Write a complete job description with the following sections:
  * Brief overview/summary of the role
  * Key responsibilities (5-7 bullet points)
  * Required qualifications and skills (4-6 bullet points)
  * Preferred qualifications (2-3 bullet points)
  * Any relevant details about work environment, team structure, or benefits
- Make it professional and realistic for this specific role
- Include industry-standard requirements and responsibilities for this position
- Be specific and detailed, not generic
- Write in a professional job posting style in ${language}
- Return ONLY the job description text in ${language} without any headers like "Job Description:" or metadata

The output should be ready to paste into a job description field.`;

    return this.generate(prompt, { maxTokens: 800, temperature: 0.7 }, userId);
  }

  async atsCheck(cvContent: string, jobDescription: string, userId?: string): Promise<AIProviderResponse> {
    const prompt = `Analyze this CV against the job description for ATS (Applicant Tracking System) compatibility.

CV Content:
${cvContent}

Job Description:
${jobDescription}

Provide a JSON response with:
{
  "score": 0-100,
  "matchedKeywords": ["keyword1", "keyword2"],
  "missingKeywords": ["keyword1", "keyword2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "overallFeedback": "brief feedback"
}`;

    return this.generate(prompt, { maxTokens: 1000, temperature: 0.3 }, userId);
  }

  async parseResume(resumeText: string, userId?: string): Promise<AIProviderResponse> {
    const prompt = `Extract structured data from the resume below. Return ONLY valid JSON (no markdown, no commentary) with EXACTLY this shape:
{
  "firstName": "",
  "lastName": "",
  "headline": "",
  "email": "",
  "phone": "",
  "city": "",
  "country": "",
  "summary": "",
  "experience": [{"position":"","company":"","location":"","startDate":"YYYY-MM","endDate":"YYYY-MM or empty if current","description":""}],
  "education": [{"institution":"","degree":"","field":"","startDate":"YYYY-MM","endDate":"YYYY-MM","description":""}],
  "skills": ["skill"]
}
Rules: use empty strings/arrays for anything not present; do NOT invent information; keep descriptions concise.

Resume:
${resumeText}`;

    return this.generate(prompt, { maxTokens: 2000, temperature: 0.2 }, userId);
  }

  async interviewPrep(
    jobDescription: string,
    cvContent: string,
    userId?: string,
  ): Promise<AIProviderResponse> {
    const prompt = `You are an experienced interview coach. Based on the job description${
      cvContent ? " and the candidate's CV" : ''
    }, prepare the candidate for the interview. Return ONLY valid JSON (no markdown, no commentary) with EXACTLY this shape:
{
  "behavioral": ["4 to 6 likely behavioral/competency questions"],
  "technical": ["4 to 6 role-specific or technical questions"],
  "questionsToAsk": ["3 to 5 thoughtful questions the candidate should ask the interviewer"],
  "tips": ["3 to 5 concise, tailored preparation tips"]
}
Keep each item a single concise sentence. Do not invent facts about the candidate.

Job Description:
${jobDescription}${cvContent ? `\n\nCandidate CV:\n${cvContent}` : ''}`;

    return this.generate(prompt, { maxTokens: 1500, temperature: 0.5 }, userId);
  }

  async linkedinOptimize(
    cvContent: string,
    targetRole: string,
    userId?: string,
  ): Promise<AIProviderResponse> {
    const prompt = `You are a LinkedIn profile expert. Based on the candidate's CV${
      targetRole ? ` and their target role "${targetRole}"` : ''
    }, produce optimized LinkedIn profile content. Return ONLY valid JSON (no markdown, no commentary) with EXACTLY this shape:
{
  "headline": "a compelling LinkedIn headline under 220 characters",
  "about": "an optimized About/summary section in the first person, 2-4 short paragraphs separated by blank lines",
  "skills": ["10 to 15 relevant skills/keywords to add to the profile"],
  "tips": ["3 to 5 concise, actionable profile tips"]
}
Base everything on the CV; do not invent experience.

Candidate CV:
${cvContent}${targetRole ? `\n\nTarget role: ${targetRole}` : ''}`;

    return this.generate(prompt, { maxTokens: 1500, temperature: 0.5 }, userId);
  }
}
