import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAIProvider, AIProviderOptions, AIProviderResponse } from './ai-provider.interface';

@Injectable()
export class AnthropicProvider implements IAIProvider {
  readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('anthropic.apiKey') || '';
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async generateText(prompt: string, options: AIProviderOptions): Promise<AIProviderResponse> {
    if (!this.apiKey) throw new Error('Anthropic API key not configured');

    const start = Date.now();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model || 'claude-haiku-4-5-20251001',
        max_tokens: options.maxTokens || 1024,
        system: 'You are a professional CV and cover letter writing assistant. Provide clear, concise, and impactful content.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`Anthropic API error ${response.status}: ${err?.error?.message || response.statusText}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content?.find((c) => c.type === 'text')?.text || '';

    return {
      content: text,
      provider: 'anthropic',
      model: data.model || 'claude-haiku-4-5-20251001',
      tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      latencyMs: Date.now() - start,
    };
  }
}
