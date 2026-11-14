import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import { AgentToolCallStatus, TransferType } from '../common/enums';
import { formatMinor, parseAmountToMinor } from '../database/money';
import { LedgerService } from '../ledger/ledger.service';
import { PagaService } from '../paga/paga.service';
import { TransfersService } from '../transfers/transfers.service';
import { User } from '../users/user.entity';
import { AgentSession } from './agent-session.entity';
import { AgentToolCall } from './agent-tool-call.entity';
import { AgentToolName, RunAgentToolDto } from './dto/agent.dto';

const BANK_FEE_MINOR = 10000n;

@Injectable()
export class AgentService {
  constructor(
    @InjectRepository(AgentSession) private readonly sessions: Repository<AgentSession>,
    @InjectRepository(AgentToolCall) private readonly toolCalls: Repository<AgentToolCall>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly transfers: TransfersService,
    private readonly paga: PagaService,
  ) {}

  async createSession(userId: string) {
    const session = await this.sessions.save(this.sessions.create({ userId, status: 'active' }));
    return { id: session.id, status: session.status, createdAt: session.createdAt };
  }

  async listSessions(userId: string) {
    return this.sessions.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async listToolCalls(userId: string, sessionId: string) {
    await this.assertSessionOwner(userId, sessionId);
    return this.toolCalls.find({
      where: { userId, sessionId },
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }

  async runTool(userId: string, dto: RunAgentToolDto) {
    const sessionId = dto.sessionId ?? (await this.createSession(userId)).id;
    await this.assertSessionOwner(userId, sessionId);

    try {
      const output = await this.dispatch(userId, dto.tool, dto.input);
      const draftTransferId = typeof output.transferId === 'string' ? output.transferId : null;
      await this.toolCalls.save(
        this.toolCalls.create({
          sessionId,
          userId,
          toolName: dto.tool,
          input: dto.input,
          output,
          status: AgentToolCallStatus.SUCCESS,
          draftTransferId,
        }),
      );
      return { sessionId, tool: dto.tool, output };
    } catch (error) {
      await this.toolCalls.save(
        this.toolCalls.create({
          sessionId,
          userId,
          toolName: dto.tool,
          input: dto.input,
          output: null,
          status: AgentToolCallStatus.ERROR,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      throw error;
    }
  }

  private async dispatch(
    userId: string,
    tool: AgentToolName,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (tool) {
      case 'get_balance':
        return this.getBalance(userId);
      case 'list_transactions':
        return this.listTransactions(userId, input);
      case 'validate_recipient':
        return this.validateRecipient(input);
      case 'create_transfer_draft':
        return this.createTransferDraft(userId, input);
      case 'create_payment_request':
        return this.createPaymentRequest(userId, input);
      case 'explain_fee':
        return this.explainFee(input);
      default:
        throw new BadRequestException('Unknown agent tool');
    }
  }

  private async getBalance(userId: string): Promise<Record<string, unknown>> {
    const wallet = await this.accounts.getWallet(userId);
    const balance = await this.ledger.getBalance(wallet.id);
    return {
      accountId: wallet.id,
      currency: 'NGN',
      balance: formatMinor(balance.balance),
      held: formatMinor(balance.held),
      available: formatMinor(balance.available),
    };
  }

  private async listTransactions(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const limit = typeof input.limit === 'number' ? input.limit : 10;
    const transactions = await this.transfers.list(userId, limit);
    return { transactions };
  }

  private async validateRecipient(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const userId = optionalString(input.userId);
    const phone = optionalString(input.phone);
    const handle = optionalString(input.handle);

    let recipient: User | null = null;
    if (userId) {
      recipient = await this.users.findOne({ where: { id: userId } });
    } else if (phone) {
      recipient = await this.users.findOne({ where: { phone } });
    } else if (handle) {
      recipient = await this.users.findOne({ where: { handle: handle.toLowerCase() } });
    } else {
      throw new BadRequestException('userId, phone or handle is required');
    }

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }
    return {
      userId: recipient.id,
      name: recipient.name,
      handle: recipient.handle,
      verified: true,
    };
  }

  private async createTransferDraft(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const amount = requireString(input.amount, 'amount');
    const deviceId = requireString(input.deviceId, 'deviceId');
    const idempotencyKey =
      typeof input.idempotencyKey === 'string' ? input.idempotencyKey : `agent_${randomUUID()}`;

    const result = await this.transfers.createDraft(
      userId,
      {
        type: TransferType.INTERNAL,
        amount,
        idempotencyKey,
        deviceId,
        recipientPhone: optionalString(input.recipientPhone),
        recipientHandle: optionalString(input.recipientHandle),
        recipientUserId: optionalString(input.recipientUserId),
      },
      { channel: 'agent' },
    );

    return {
      transferId: result.transfer.id,
      status: result.transfer.status,
      amount: result.transfer.amount,
      fee: result.transfer.fee,
      recipientName: result.transfer.recipientName,
      challenge: result.challenge,
      requiresUserApproval: true,
    };
  }

  private async createPaymentRequest(
    userId: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const amount = parseAmountToMinor(requireString(input.amount, 'amount'));
    const reference = `pr_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const request = await this.paga.createPaymentRequest({
      reference,
      amountMinor: amount,
      payerName: optionalString(input.payerName),
    });
    return {
      reference,
      amount: formatMinor(amount),
      pagaReference: request.referenceNumber,
      status: request.statusMessage || request.statusCode,
      paymentMethods: request.paymentMethods,
      note: 'Payment requests do not move money; fulfilment credits the ledger via webhook.',
    };
  }

  private explainFee(input: Record<string, unknown>): Record<string, unknown> {
    const type = typeof input.type === 'string' ? input.type : 'internal';
    if (type === TransferType.BANK) {
      return {
        type: 'bank',
        fee: formatMinor(BANK_FEE_MINOR),
        currency: 'NGN',
        explanation: 'Bank payouts carry a flat Vireo fee on top of the transfer amount.',
      };
    }
    return {
      type: 'internal',
      fee: '0.00',
      currency: 'NGN',
      explanation: 'Transfers between Vireo users are free.',
    };
  }

  private async assertSessionOwner(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessions.findOne({ where: { id: sessionId, userId } });
    if (!session) {
      throw new ForbiddenException('Agent session does not belong to this user');
    }
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
