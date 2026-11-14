import { IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';

export const AGENT_TOOLS = [
  'get_balance',
  'list_transactions',
  'validate_recipient',
  'create_transfer_draft',
  'create_payment_request',
  'explain_fee',
] as const;

export type AgentToolName = (typeof AGENT_TOOLS)[number];

export class RunAgentToolDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsIn(AGENT_TOOLS)
  tool: AgentToolName;

  @IsObject()
  input: Record<string, unknown>;
}

export class CreateAgentSessionDto {}
