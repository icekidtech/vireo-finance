import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { AgentService } from '../agent.service';
import type { AgentToolName } from '../dto/agent.dto';

const SYSTEM_PROMPT = `You are Vireo, an AI banking assistant for Vireo Finance, a Nigerian fintech platform.
You help users check balances, send money, and understand their finances.
You MUST use the provided tools to fetch real data — never make up account balances or transaction details.
When creating a transfer draft, always confirm the amount and recipient with the user before proceeding.
Financial amounts are always in Nigerian Naira (NGN).`;

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly client: OpenAI | null = null;
  private readonly model: string;

  /** In-memory session history. Production should persist to Redis or DB. */
  private readonly histories = new Map<string, ChatCompletionMessageParam[]>();

  constructor(
    private readonly config: ConfigService,
    private readonly agentService: AgentService,
  ) {
    const apiKey = this.config.get<string>('openai.apiKey') ?? '';
    this.model = this.config.get<string>('openai.model') ?? 'gpt-4o';
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not set — /agent/chat will return a stub response');
    } else {
      this.client = new OpenAI({ apiKey });
    }
  }

  async chat(
    sessionId: string,
    userId: string,
    message: string,
  ): Promise<{ reply: string; toolsExecuted: string[] }> {
    if (!this.client) {
      return {
        reply: 'The AI assistant is not configured (OPENAI_API_KEY missing). Please contact support.',
        toolsExecuted: [],
      };
    }

    const history = this.histories.get(sessionId) ?? [];
    const toolsExecuted: string[] = [];

    // Build messages array: system + history + new user message
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message },
    ];

    const maxIterations = 10;
    let iterations = 0;

    // Function-calling loop
    while (iterations < maxIterations) {
      iterations++;
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
      });

      const choice = completion.choices[0];
      if (!choice) break;

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      // If no tool calls, we have the final reply
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const replyText = assistantMessage.content ?? '';

        // Persist conversation history (without system prompt)
        history.push({ role: 'user', content: message });
        history.push({ role: 'assistant', content: replyText });
        this.histories.set(sessionId, history);

        return { reply: replyText, toolsExecuted };
      }

      // Execute each tool call
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== 'function') continue;
        const toolName = toolCall.function.name as AgentToolName;
        let toolInput: Record<string, unknown> = {};
        try {
          toolInput = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          this.logger.warn(`Failed to parse tool args for ${toolName}: ${toolCall.function.arguments}`);
        }

        this.logger.log(`OpenAI → ${toolName}(${JSON.stringify(toolInput).slice(0, 200)})`);
        toolsExecuted.push(toolName);

        let output: Record<string, unknown>;
        try {
          const result = await this.agentService.runTool(userId, {
            sessionId,
            tool: toolName,
            input: toolInput,
          });
          output = result.output;
        } catch (error) {
          output = { error: error instanceof Error ? error.message : String(error) };
        }

        // Push tool result back into messages
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(output),
        });
      }
      // Loop continues — OpenAI will see the tool results and generate a reply or more tool calls
    }

    // Fallback if max iterations reached
    const lastMessage = messages[messages.length - 1];
    const fallbackReply =
      lastMessage && 'content' in lastMessage && typeof lastMessage.content === 'string'
        ? lastMessage.content
        : 'I was unable to complete your request. Please try again.';

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: fallbackReply });
    this.histories.set(sessionId, history);

    return { reply: fallbackReply, toolsExecuted };
  }
}

/* ------------------------------------------------------------------ */
/* Tool definitions — mirrors AgentService.dispatch()                 */
/* ------------------------------------------------------------------ */

const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_balance',
      description: "Get the user's current wallet balance, including held funds and available balance.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_transactions',
      description: 'List recent transactions for the user.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default 10, max 50)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'validate_recipient',
      description: 'Validate a payment recipient by phone, Vireo handle, or bank account.',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Recipient phone number' },
          handle: { type: 'string', description: 'Recipient Vireo handle (e.g. @john)' },
          bankCode: { type: 'string', description: 'Nigerian bank code (e.g. 058 for GTBank)' },
          accountNumber: { type: 'string', description: 'Bank account number' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_transfer_draft',
      description: 'Create a draft transfer (does NOT execute it — user must confirm). Returns a challenge that must be signed.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'string', description: 'Amount in NGN (e.g. "5000.00")' },
          recipientPhone: { type: 'string', description: 'Recipient phone number' },
          recipientHandle: { type: 'string', description: 'Recipient Vireo handle' },
          recipientUserId: { type: 'string', description: 'Recipient Vireo user ID' },
          idempotencyKey: { type: 'string', description: 'Idempotency key' },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_payment_request',
      description: 'Create a payment request (a payment link/QR for someone to pay you).',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'string', description: 'Amount to request in NGN' },
          payerName: { type: 'string', description: 'Name of the expected payer' },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explain_fee',
      description: 'Explain the fee for a type of transfer.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: '"internal" (free) or "bank" (has fee)' },
        },
        required: [],
      },
    },
  },
];
