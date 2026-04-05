import { Injectable, ServiceUnavailableException, Logger } from '@nestjs/common';
import { OpenAIProvider } from './providers/openai.provider';
import { IAIProvider, AIProviderOptions, AIProviderResponse } from './providers/ai-provider.interface';
import { UsersService } from '../users/users.service';

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private providers: IAIProvider[];
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();

  private readonly FAILURE_THRESHOLD = 3;
  private readonly RESET_TIMEOUT = 60000; // 60 seconds

  constructor(
    private openaiProvider: OpenAIProvider,
    private usersService: UsersService,
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

  async generate(
    prompt: string,
    options: Partial<AIProviderOptions> = {},
    userId?: string,
  ): Promise<AIProviderResponse> {
    // Check usage limit
    if (userId) {
      const user = await this.usersService.findById(userId);
      if (user && user.usage.aiCreditsUsed >= user.usage.aiCreditsLimit) {
        throw new ServiceUnavailableException('AI credits exhausted. Please upgrade your plan.');
      }
    }

    const fullOptions: AIProviderOptions = {
      maxTokens: options.maxTokens || 1024,
      temperature: options.temperature || 0.7,
      model: options.model,
    };

    let lastError = '';

    for (const provider of this.providers) {
      if (this.isCircuitOpen(provider.name)) {
        this.logger.debug(`Skipping ${provider.name} (circuit open)`);
        continue;
      }

      const available = await provider.isAvailable();
      if (!available) {
        lastError = `${provider.name}: API key not configured`;
        this.logger.warn(`Skipping ${provider.name} — API key not configured (check OPENAI_API_KEY env var)`);
        continue;
      }

      try {
        const result = await provider.generateText(prompt, fullOptions);

        if (!result.content?.trim()) {
          lastError = `${provider.name}: returned empty content`;
          this.logger.warn(`${provider.name} returned empty content — treating as failure`);
          this.recordFailure(provider.name);
          continue;
        }

        this.recordSuccess(provider.name);

        // Track usage
        if (userId) {
          await this.usersService.incrementUsage(userId, 'aiCreditsUsed');
        }

        this.logger.log(`Generated via ${provider.name} in ${result.latencyMs}ms (${result.content.length} chars)`);
        return result;
      } catch (error) {
        lastError = `${provider.name}: ${(error as Error).message}`;
        this.recordFailure(provider.name);
        this.logger.error(`${provider.name} failed: ${(error as Error).message}`);
      }
    }

    throw new ServiceUnavailableException(`AI generation failed — ${lastError || 'no providers available'}`);
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

  async generateCoverLetter(
    jobTitle: string,
    jobDescription: string,
    companyName: string,
    candidateProfile: string,
    tone: string,
    userId?: string,
    language: string = 'English',
  ): Promise<AIProviderResponse> {
    const prompt = `Write a compelling, professional cover letter that demonstrates a strong fit for this position.

Job Title: ${jobTitle}
Company: ${companyName}
Job Description: ${jobDescription}

Candidate Profile:
${candidateProfile}

Tone: ${tone}
Output Language: ${language}

Requirements:
- Write in FIRST PERSON (I, my, me) - this is from the candidate's perspective
- Professional ${tone} tone throughout
- 3-5 well-structured paragraphs (opening, 2-3 body paragraphs, closing)
- Strong opening that expresses genuine interest in the role and company
- Include 2-3 SPECIFIC examples from the candidate's experience that directly relate to job requirements
- Connect the candidate's skills and achievements to the company's needs
- Avoid generic statements - be specific and concrete using information from the candidate profile
- NO placeholder text like [Name], [Date], [Company], etc. - use actual values provided
- Compelling closing that invites further discussion
- Write the ENTIRE cover letter in ${language}
- Return ONLY the cover letter body text in ${language} (no date, address headers, or signature)

The cover letter should tell a cohesive story about why this candidate is an excellent fit for this specific role.`;

    return this.generate(prompt, { maxTokens: 1500, temperature: 0.7 }, userId);
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
}
