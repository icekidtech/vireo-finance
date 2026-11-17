import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  choices?: Array<{ message?: { content: string | null; tool_calls?: ToolCall[] } }>;
}

/**
 * Thin OpenAI chat-completions client over fetch. It knows nothing about
 * banking: AgentService owns the tools, the session and the money rules.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: ConfigService) {
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
      this.logger.error(`OpenAI request failed: ${String(error)}`);
      throw new BadGatewayException('The assistant is unavailable right now');
    }

    if (!response.ok) {
      // The body can echo prompt content; log the status only.
      this.logger.error(`OpenAI responded ${response.status}`);
      throw new BadGatewayException('The assistant is unavailable right now');
    }

    const data = (await response.json()) as CompletionResponse;
    const message = data.choices?.[0]?.message;
    return { content: message?.content ?? null, toolCalls: message?.tool_calls ?? [] };
  }
}
