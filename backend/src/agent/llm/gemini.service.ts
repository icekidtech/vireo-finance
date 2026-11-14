import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Content,
  FunctionDeclaration,
  FunctionDeclarationSchema,
  GenerativeModel,
  GoogleGenerativeAI,
  Part,
  SchemaType,
  Tool,
} from '@google/generative-ai';
import { AgentService } from '../agent.service';
import type { AgentToolName } from '../dto/agent.dto';

const SYSTEM_INSTRUCTION = `You are Vireo, an AI banking assistant for Vireo Finance, a Nigerian fintech platform.
You help users check balances, send money, and understand their finances.
You MUST use the provided tools to fetch real data — never make up account balances or transaction details.
When creating a transfer draft, always confirm the amount and recipient with the user before proceeding.
Financial amounts are always in Nigerian Naira (NGN).`;

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly model: GenerativeModel | null = null;

  /** In-memory session history. Production should persist to Redis or DB. */
  private readonly histories = new Map<string, Content[]>();

  constructor(
    private readonly config: ConfigService,
    private readonly agentService: AgentService,
  ) {
    const apiKey = this.config.get<string>('gemini.apiKey') ?? '';
    const modelName = this.config.get<string>('gemini.model') ?? 'gemini-1.5-pro';
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — /agent/chat will return a stub response');
    } else {
      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }] as Tool[],
      });
    }
  }

  async chat(
    sessionId: string,
    userId: string,
    message: string,
  ): Promise<{ reply: string; toolsExecuted: string[] }> {
    if (!this.model) {
      return {
        reply: 'The AI assistant is not configured (GEMINI_API_KEY missing). Please contact support.',
        toolsExecuted: [],
      };
    }

    const history = this.histories.get(sessionId) ?? [];
    const toolsExecuted: string[] = [];

    const chat = this.model.startChat({ history: [...history] });
    let response = await chat.sendMessage(message);
    let candidate = response.response;

    // Function calling loop — Gemini may request multiple sequential tool calls
    const maxIterations = 10;
    let iterations = 0;
    while (
      candidate.functionCalls &&
      candidate.functionCalls()?.length &&
      iterations < maxIterations
    ) {
      iterations++;
      const calls = candidate.functionCalls()!;
      const functionResponses: Part[] = [];

      for (const call of calls) {
        const toolName = call.name as AgentToolName;
        const toolInput = (call.args ?? {}) as Record<string, unknown>;
        this.logger.log(`Gemini → ${toolName}(${JSON.stringify(toolInput).slice(0, 200)})`);
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

        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: output as object,
          },
        });
      }

      // Push the model's function-call turn and our responses into context
      const modelParts = candidate.candidates?.[0]?.content?.parts;
      if (modelParts) {
        history.push({ role: 'model', parts: modelParts });
      }

      response = await chat.sendMessage(functionResponses);
      candidate = response.response;
    }

    const replyText = candidate.text();

    // Persist conversation history
    history.push({ role: 'user', parts: [{ text: message }] });
    history.push({ role: 'model', parts: [{ text: replyText }] });
    this.histories.set(sessionId, history);

    return { reply: replyText, toolsExecuted };
  }
}

/* ------------------------------------------------------------------ */
/* Tool declarations — mirrors AgentService.dispatch()                */
/* ------------------------------------------------------------------ */

const objSchema = (
  properties: FunctionDeclarationSchema['properties'],
  required?: string[],
): FunctionDeclarationSchema => ({
  type: SchemaType.OBJECT,
  properties,
  ...(required?.length ? { required } : {}),
});

const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'get_balance',
    description: "Get the user's current wallet balance, including held funds and available balance.",
    parameters: objSchema({}),
  },
  {
    name: 'list_transactions',
    description: 'List recent transactions for the user.',
    parameters: objSchema({
      limit: { type: SchemaType.NUMBER, description: 'Max results (default 10, max 50)' },
    }),
  },
  {
    name: 'validate_recipient',
    description: 'Validate a payment recipient by phone, Vireo handle, or bank account.',
    parameters: objSchema({
      phone: { type: SchemaType.STRING, description: 'Recipient phone number' },
      handle: { type: SchemaType.STRING, description: 'Recipient Vireo handle (e.g. @john)' },
      bankCode: { type: SchemaType.STRING, description: 'Nigerian bank code (e.g. 058 for GTBank)' },
      accountNumber: { type: SchemaType.STRING, description: 'Bank account number' },
    }),
  },
  {
    name: 'create_transfer_draft',
    description:
      'Create a draft transfer (does NOT execute it — user must confirm). Returns a challenge that must be signed.',
    parameters: objSchema(
      {
        amount: { type: SchemaType.STRING, description: 'Amount in NGN (e.g. "5000.00")' },
        recipientPhone: { type: SchemaType.STRING, description: 'Recipient phone number' },
        recipientHandle: { type: SchemaType.STRING, description: 'Recipient Vireo handle' },
        recipientUserId: { type: SchemaType.STRING, description: 'Recipient Vireo user ID' },
        idempotencyKey: { type: SchemaType.STRING, description: 'Idempotency key' },
      },
      ['amount'],
    ),
  },
  {
    name: 'create_payment_request',
    description: 'Create a payment request (a payment link/QR for someone to pay you).',
    parameters: objSchema(
      {
        amount: { type: SchemaType.STRING, description: 'Amount to request in NGN' },
        payerName: { type: SchemaType.STRING, description: 'Name of the expected payer' },
      },
      ['amount'],
    ),
  },
  {
    name: 'explain_fee',
    description: 'Explain the fee for a type of transfer.',
    parameters: objSchema({
      type: {
        type: SchemaType.STRING,
        description: '"internal" (free) or "bank" (has fee)',
      },
    }),
  },
];
