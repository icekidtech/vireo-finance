import { IsIn, IsObject, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export const AGENT_TOOLS = [
  'get_balance',
  'get_deposit_account',
  'list_transactions',
  'validate_recipient',
  'create_transfer_draft',
  'create_bank_transfer_draft',
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

export class ChatMessageDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsString()
  @Length(1, 2000)
  message: string;

  /**
   * The caller's registered signing device. Needed so a transfer draft the
   * assistant prepares can be approved (signed) on that phone. Never taken
   * from the model.
   */
  @IsOptional()
  @IsUUID()
  deviceId?: string;
}
