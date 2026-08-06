import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { IAIProvider, AIProviderOptions, AIProviderResponse } from './ai-provider.interface';

@Injectable()
export class OpenAIProvider implements IAIProvider {
  readonly name = 'openai';
  private client!: OpenAI;
  private readonly logger = new Logger(OpenAIProvider.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('openai.apiKey');
    if (apiKey) {
      // ── Timeout budget (must stay consistent with apps/web/src/lib/api.ts) ──
      // Browser AI budget      60s
      //   └ this request       40s  ← one attempt, no SDK retry
      //     └ Firestore writes  ~1s
      //
      // Was `timeout: 20000, maxRetries: 1`. Two problems:
      //  1. 20s is below the p95 for a full cover letter (~1500 output tokens),
      //     so genuine generations were aborted mid-flight — the "Request timed
      //     out" the client reported.
      //  2. maxRetries:1 made a timeout cost 2×20s before failing, and the SDK
      //     treats timeouts as retryable, so raising the timeout WITH a retry
      //     would have pushed the worst case past the browser's own budget and
      //     the user would see a timeout while the server was still working.
      // One generous attempt keeps the server's worst case inside the browser's,
      // and retrying is now an explicit user action in the UI instead of a
      // hidden doubling of latency. Never log any part of the key (CWE-532).
      this.client = new OpenAI({ apiKey, timeout: 40000, maxRetries: 0 });
      this.logger.log('OpenAI client initialised');
    } else {
      this.logger.error('OPENAI_API_KEY is not set — OpenAI provider disabled');
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.client;
  }

  async generateText(prompt: string, options: AIProviderOptions): Promise<AIProviderResponse> {
    if (!this.client) throw new Error('OpenAI client not initialised — check OPENAI_API_KEY');

    const start = Date.now();

    const completion = await this.client.chat.completions.create({
      model: options.model || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a professional CV and cover letter writing assistant. Provide clear, concise, and impactful content.',
        },
        { role: 'user', content: prompt },
      ],
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    });

    return {
      content: completion.choices[0]?.message?.content || '',
      provider: 'openai',
      model: completion.model,
      tokensUsed: completion.usage?.total_tokens || 0,
      latencyMs: Date.now() - start,
    };
  }
}
