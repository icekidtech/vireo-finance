import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redactForLog } from '../../common/logging/redact';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

interface CompletionResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: { content: string | null; tool_calls?: ToolCall[] };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { type?: string; code?: string; message?: string };
}

const PREVIEW_CHARS = 200;

/**
 * Thin OpenAI chat-completions client over fetch. It knows nothing about
 * banking: AgentService owns the tools, the session and the money rules.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly logPayloads: boolean;

  constructor(config: ConfigService) {
    this.logPayloads = config.get<boolean>('logging.llmPayloads') ?? false;
    this.apiKey = config.get<string>('openai.apiKey') ?? '';
    this.model = config.get<string>('openai.model') ?? 'gpt-4o-mini';
    if (!this.apiKey) {
      this.logger.warn('OPENAI_API_KEY is not set; POST /agent/chat is disabled');
    }
  }

  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  async complete(
    messages: ChatMessage[],
    tools: ToolDefinition[],
  ): Promise<{ content: string | null; toolCalls: ToolCall[] }> {
    if (!this.enabled) {
      throw new ServiceUnavailableException('The assistant is not configured');
    }

    const started = Date.now();
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    this.logger.log(
      `OpenAI request model=${this.model} messages=${messages.length} tools=${tools.length}` +
        (this.logPayloads
          ? ` payload=${JSON.stringify(redactForLog({ messages, tools: tools.map((t) => t.function.name) }))}`
          : ` lastUserChars=${lastUser && 'content' in lastUser ? String(lastUser.content).length : 0}`),
    );

    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, messages, tools, tool_choice: 'auto' }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      this.logger.error(`OpenAI request failed after ${Date.now() - started}ms: ${String(error)}`);
      throw new BadGatewayException('The assistant is unavailable right now');
    }

    const ms = Date.now() - started;
    if (!response.ok) {
      // Log the error type/code. The message can echo parts of the prompt or a
      // masked key, so it is only included when payload logging is enabled.
      let detail = '';
      try {
        const err = ((await response.json()) as CompletionResponse).error;
        detail = ` type=${err?.type ?? '?'} code=${err?.code ?? '?'}${
          this.logPayloads ? ` message="${String(err?.message ?? '').slice(0, 300)}"` : ''
        }`;
      } catch {
        /* non-JSON error body */
      }
      this.logger.error(`OpenAI response status=${response.status} ${ms}ms${detail}`);
      throw new BadGatewayException('The assistant is unavailable right now');
    }

    const data = (await response.json()) as CompletionResponse;
    const choice = data.choices?.[0];
    const message = choice?.message;
    const toolNames = (message?.tool_calls ?? []).map((t) => t.function.name);
    this.logger.log(
      `OpenAI response status=${response.status} ${ms}ms finish=${choice?.finish_reason ?? '?'} ` +
        `tokens=${data.usage?.total_tokens ?? '?'} (prompt=${data.usage?.prompt_tokens ?? '?'} completion=${data.usage?.completion_tokens ?? '?'}) ` +
        `toolCalls=[${toolNames.join(',')}] reply=${JSON.stringify(
          (message?.content ?? '').slice(0, this.logPayloads ? 4000 : PREVIEW_CHARS),
        )}`,
    );
    return { content: message?.content ?? null, toolCalls: message?.tool_calls ?? [] };
  }
}
