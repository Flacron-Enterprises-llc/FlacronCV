import type { TextModel, TextModelRequest, TextModelResponse } from '../ai/text-model';

type Reply = string | Error | ((request: TextModelRequest) => string | Promise<string>);

/**
 * Scripted replies per prompt template. A template with no script throws,
 * so a test never gets an answer it did not write. `hold()` keeps the
 * next call open until `release()`, for tests about requests in flight.
 */
export class FakeTextModel implements TextModel {
  readonly calls: TextModelRequest[] = [];
  private readonly scripts = new Map<string, Reply[]>();
  private readonly defaults = new Map<string, Reply>();
  private gate: { promise: Promise<void>; open: () => void } | null = null;

  /** The next call for this template gets `reply`. Queued in order. */
  once(template: string, reply: Reply): this {
    const queue = this.scripts.get(template) ?? [];
    queue.push(reply);
    this.scripts.set(template, queue);
    return this;
  }

  /** Every call for this template gets `reply` once its queue is empty. */
  always(template: string, reply: Reply): this {
    this.defaults.set(template, reply);
    return this;
  }

  hold(): void {
    let open: () => void = () => undefined;
    const promise = new Promise<void>((resolve) => {
      open = resolve;
    });
    this.gate = { promise, open };
  }

  release(): void {
    this.gate?.open();
    this.gate = null;
  }

  callsFor(template: string): TextModelRequest[] {
    return this.calls.filter((c) => c.template === template);
  }

  async complete(request: TextModelRequest): Promise<TextModelResponse> {
    this.calls.push(request);
    if (this.gate) await this.gate.promise;
    const reply = this.scripts.get(request.template)?.shift() ?? this.defaults.get(request.template);
    if (reply === undefined) throw new Error(`FakeTextModel has no reply for template ${request.template}`);
    if (reply instanceof Error) throw reply;
    const text = typeof reply === 'function' ? await reply(request) : reply;
    return { text, provider: 'fake', model: 'fake-model-1' };
  }
}
