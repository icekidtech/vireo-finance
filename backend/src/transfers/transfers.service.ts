import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { EntityManager, Repository } from 'typeorm';
import { AccountsService } from '../accounts/accounts.service';
import {
  ChallengeType,
  HoldStatus,
  LedgerDirection,
  LedgerTransactionType,
  MerchantOrderStatus,
  TransferStatus,
  TransferType,
} from '../common/enums';
import {
  DEFAULT_CURRENCY,
  SYSTEM_FEE_INCOME_ACCOUNT_ID,
  SYSTEM_PAGA_POOL_ACCOUNT_ID,
} from '../common/constants';
import { Challenge } from '../challenges/challenge.entity';
import { ChallengesService } from '../challenges/challenges.service';
import { formatMinor, parseAmountToMinor, assertPositive } from '../database/money';
import { Hold } from '../ledger/hold.entity';
import { LedgerService } from '../ledger/ledger.service';
import { Merchant } from '../merchant/merchant.entity';
import { MerchantOrder } from '../merchant/merchant-order.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PagaService } from '../paga/paga.service';
import { RiskService } from '../risk/risk.service';
import { BalanceCapService } from '../risk/balance-cap.service';
import { User } from '../users/user.entity';
import { BankLookupDto, CreateTransferDraftDto } from './dto/transfers.dto';
import { Transfer } from './transfer.entity';

const BANK_TRANSFER_FEE_MINOR = 10000n;

const LOOKUP_WINDOW_MS = 60_000;
const LOOKUP_LIMIT = 15;

@Injectable()
export class TransfersService {
  /** Per-instance sliding window of bank lookups by user. */
  private readonly lookups = new Map<string, number[]>();

  private readonly logger = new Logger(TransfersService.name);

  constructor(
    @InjectRepository(Transfer) private readonly transfers: Repository<Transfer>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Merchant) private readonly merchants: Repository<Merchant>,
    @InjectRepository(MerchantOrder) private readonly orders: Repository<MerchantOrder>,
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
    private readonly challenges: ChallengesService,
    private readonly risk: RiskService,
    private readonly paga: PagaService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly balanceCaps?: BalanceCapService,
  ) {}

  /** Banks Paga can pay out to, for the client's bank picker. */
  async listBanks() {
    const banks = await this.paga.listBanks();
    return banks
      .map((b) => ({ code: b.uuid, name: b.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Resolve the account holder's name so the sender can confirm who they are
   * paying. Rate-limited per user: an open lookup would let anyone enumerate
   * account holders.
   */
  async lookupBankAccount(userId: string, dto: BankLookupDto) {
    const now = Date.now();
    const recent = (this.lookups.get(userId) ?? []).filter((t) => now - t < LOOKUP_WINDOW_MS);
    if (recent.length >= LOOKUP_LIMIT) {
      throw new HttpException(
        'Too many account lookups. Try again in a minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.lookups.set(userId, recent);

    const validated = await this.paga.validateBankAccount({
      bankCode: dto.bankCode,
      accountNumber: dto.accountNumber,
      amountMinor: parseAmountToMinor(dto.amount ?? '1'),
      reference: `val_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
    });
    this.logger.log(`Bank account lookup by user=${userId} bank=${dto.bankCode}`);
    return {
      accountName: validated.accountName,
      accountNumber: validated.accountNumber,
      bankCode: dto.bankCode,
    };
  }

  async createDraft(
    userId: string,
    dto: CreateTransferDraftDto,
    options?: { channel?: 'user' | 'agent' },
  ) {
    const channel = options?.channel ?? 'user';
    const existing = await this.transfers.findOne({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existing) {
      if (existing.initiatedByUserId !== userId) {
        throw new ConflictException('Idempotency key already used by another user');
      }
      const challenge = existing.challengeId
        ? await this.findChallenge(existing.challengeId)
        : null;
      return {
        transfer: presentTransfer(existing),
        challenge: challenge && presentChallenge(challenge),
      };
    }

    const user = await this.getUser(userId);
    const source = await this.accounts.getWallet(userId);
    const amount = parseAmountToMinor(dto.amount);
    assertPositive(amount);

    let destinationAccountId: string | null = null;
    let recipientName = '';
    let recipientKey = '';
    let recipientPhone: string | null = null;
    let recipientBankCode: string | null = null;
    let recipientAccountNumber: string | null = null;
    let bankUuid: string | null = null;
    let fee = 0n;
    let order: MerchantOrder | null = null;

    if (dto.type === TransferType.INTERNAL) {
      const resolved = await this.resolveInternalRecipient(userId, dto);
      destinationAccountId = resolved.walletId;
      recipientName = resolved.name;
      recipientPhone = resolved.phone;
      recipientKey = resolved.key;
    } else if (dto.type === TransferType.BANK) {
      if (!dto.bankCode || !dto.accountNumber) {
        throw new BadRequestException('bankCode and accountNumber are required for bank transfers');
      }
      const validated = await this.paga.validateBankAccount({
        bankCode: dto.bankCode,
        accountNumber: dto.accountNumber,
        amountMinor: amount,
        reference: `val_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
      });
      recipientName = validated.accountName;
      recipientBankCode = validated.bankCode;
      recipientAccountNumber = validated.accountNumber;
      bankUuid = validated.bankUuid;
      recipientKey = `bank:${validated.bankUuid}:${validated.accountNumber}`;
      fee = BANK_TRANSFER_FEE_MINOR;
    } else if (dto.type === TransferType.MERCHANT) {
      if (!dto.orderReference) {
        throw new BadRequestException('orderReference is required for merchant payments');
      }
      order = await this.orders.findOne({ where: { reference: dto.orderReference } });
      if (!order) {
        throw new NotFoundException('Merchant order not found');
      }
      if (order.status !== MerchantOrderStatus.OPEN) {
        throw new BadRequestException(`Merchant order is ${order.status}`);
      }
      if (order.expiresAt && order.expiresAt.getTime() < Date.now()) {
        order.status = MerchantOrderStatus.EXPIRED;
        await this.orders.save(order);
        throw new BadRequestException('Merchant order has expired');
      }
      if (BigInt(order.amount) !== amount) {
        throw new BadRequestException('Amount does not match the merchant order');
      }
      const merchant = await this.merchants.findOne({ where: { id: order.merchantId } });
      if (!merchant) {
        throw new NotFoundException('Merchant not found');
      }
      const merchantAccount = await this.accounts.getMerchantAccount(merchant.id);
      destinationAccountId = merchantAccount.id;
      recipientName = merchant.businessName;
      recipientKey = `merchant:${merchant.id}`;
    } else {
      throw new BadRequestException('Unsupported transfer type');
    }

    await this.risk.preCheck({
      userId,
      kycTier: user.kycTier,
      amount,
      fee,
      recipientKey,
      channel,
    });

    const transfer = await this.transfers.save(
      this.transfers.create({
        idempotencyKey: dto.idempotencyKey,
        type: dto.type,
        status: TransferStatus.DRAFT,
        sourceAccountId: source.id,
        destinationAccountId,
        initiatedByUserId: userId,
        recipientPhone,
        recipientBankCode,
        recipientAccountNumber,
        recipientName,
        amount: amount.toString(),
        fee: fee.toString(),
        currency: DEFAULT_CURRENCY,
        metadata: {
          recipientKey,
          channel,
          ...(bankUuid ? { bankUuid } : {}),
          ...(order ? { orderReference: order.reference } : {}),
        },
      }),
    );

    const challenge = await this.challenges.issue({
      userId,
      deviceId: dto.deviceId,
      type:
        dto.type === TransferType.MERCHANT
          ? ChallengeType.MERCHANT_PAYMENT
          : ChallengeType.TRANSFER,
      payload: this.buildChallengePayload(transfer),
    });

    transfer.challengeId = challenge.id;
    await this.transfers.save(transfer);

    return { transfer: presentTransfer(transfer), challenge: presentChallenge(challenge) };
  }

  async submit(userId: string, transferId: string, signature: string) {
    const preview = await this.transfers.findOne({
      where: { id: transferId, initiatedByUserId: userId },
    });
    if (!preview) {
      throw new NotFoundException('Transfer not found');
    }
    if (preview.status === TransferStatus.COMPLETED) {
      return { transfer: presentTransfer(preview) };
    }
    if (preview.status !== TransferStatus.DRAFT) {
      throw new BadRequestException(`Transfer is already ${preview.status}`);
    }

    if (preview.type === TransferType.INTERNAL) {
      return this.executeInternal(userId, transferId, signature);
    }
    if (preview.type === TransferType.MERCHANT) {
      return this.executeMerchant(userId, transferId, signature);
    }
    if (preview.type === TransferType.BANK) {
      return this.executeBank(userId, transferId, signature);
    }
    throw new BadRequestException('Unsupported transfer type');
  }

  async get(userId: string, transferId: string) {
    const transfer = await this.transfers.findOne({
      where: { id: transferId, initiatedByUserId: userId },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    return presentTransfer(transfer);
  }

  async list(userId: string, limit = 50) {
    const rows = await this.transfers.find({
      where: { initiatedByUserId: userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.map(presentTransfer);
  }

  private async executeInternal(userId: string, transferId: string, signature: string) {
    const transfer = await this.ledger.runInTransaction(async (manager) => {
      const locked = await this.lockDraft(manager, userId, transferId);
      await this.consumeForTransfer(manager, locked, signature, ChallengeType.TRANSFER);
      await this.riskCheck(locked);

      const amount = BigInt(locked.amount);
      await this.ledger.post(manager, {
        idempotencyKey: `transfer:${locked.id}`,
        type: LedgerTransactionType.INTERNAL_TRANSFER,
        reference: locked.id,
        currency: locked.currency,
        metadata: { transferId: locked.id },
        legs: [
          {
            accountId: locked.sourceAccountId!,
            direction: LedgerDirection.DEBIT,
            amount,
          },
          {
            accountId: locked.destinationAccountId!,
            direction: LedgerDirection.CREDIT,
            amount,
          },
        ],
      });

      locked.status = TransferStatus.COMPLETED;
      return manager.getRepository(Transfer).save(locked);
    });

    // The recipient's balance may now exceed their tier cap; the sender's may have dropped below it.
    await this.reconcileCaps([
      transfer.destinationAccountId
        ? await this.accounts.walletOwner(transfer.destinationAccountId)
        : null,
      transfer.initiatedByUserId,
    ]);
    return { transfer: presentTransfer(transfer) };
  }

  private async reconcileCaps(userIds: (string | null | undefined)[]): Promise<void> {
    if (!this.balanceCaps) return;
    for (const id of new Set(userIds.filter((v): v is string => !!v))) {
      await this.balanceCaps
        .reconcile(id)
        .catch((e) => this.logger.warn(`Balance cap reconcile failed for ${id}: ${String(e)}`));
    }
  }

  private async executeMerchant(userId: string, transferId: string, signature: string) {
    const { transfer, merchantId } = await this.ledger.runInTransaction(async (manager) => {
      const locked = await this.lockDraft(manager, userId, transferId);
      const orderReference = locked.metadata?.orderReference as string | undefined;
      if (!orderReference) {
        throw new BadRequestException('Transfer is missing its merchant order reference');
      }
      const order = await manager.getRepository(MerchantOrder).findOne({
        where: { reference: orderReference },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Merchant order not found');
      }
      if (order.status !== MerchantOrderStatus.OPEN) {
        throw new BadRequestException(`Merchant order is ${order.status}`);
      }

      await this.consumeForTransfer(manager, locked, signature, ChallengeType.MERCHANT_PAYMENT);
      await this.riskCheck(locked);

      const amount = BigInt(locked.amount);
      await this.ledger.post(manager, {
        idempotencyKey: `transfer:${locked.id}`,
        type: LedgerTransactionType.MERCHANT_PAYMENT,
        reference: locked.id,
        currency: locked.currency,
        metadata: { transferId: locked.id, orderReference },
        legs: [
          {
            accountId: locked.sourceAccountId!,
            direction: LedgerDirection.DEBIT,
            amount,
          },
          {
            accountId: locked.destinationAccountId!,
            direction: LedgerDirection.CREDIT,
            amount,
          },
        ],
      });

      order.status = MerchantOrderStatus.PAID;
      order.paidByUserId = userId;
      order.transferId = locked.id;
      await manager.getRepository(MerchantOrder).save(order);

      locked.status = TransferStatus.COMPLETED;
      const saved = await manager.getRepository(Transfer).save(locked);
      return { transfer: saved, merchantId: order.merchantId };
    });

    // Best-effort after commit: a notification failure must never fail a payment.
    await this.notifyMerchantPaid(merchantId, transfer);
    return { transfer: presentTransfer(transfer) };
  }

  /**
   * Settles an open merchant order from a customer's wallet after the customer
   * was verified biometrically at the till. There is no device signature on
   * this path, so the caller (TerminalPaymentService) is the only authorization
   * and must have verified the customer. The order is locked for the whole
   * operation, so a QR payment and a terminal payment cannot both succeed.
   */
  async payOrderWithBiometric(input: {
    customerUserId: string;
    merchantId: string;
    orderReference: string;
    biometricTypes: string[];
  }) {
    const { customerUserId, merchantId, orderReference } = input;
    const customer = await this.getUser(customerUserId);
    const source = await this.accounts.getWallet(customerUserId);
    const merchantAccount = await this.accounts.getMerchantAccount(merchantId);
    const merchant = await this.merchants.findOne({ where: { id: merchantId } });
    if (!merchant) {
      throw new NotFoundException('Merchant not found');
    }

    const { transfer } = await this.ledger.runInTransaction(async (manager) => {
      const order = await manager.getRepository(MerchantOrder).findOne({
        where: { reference: orderReference, merchantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        throw new NotFoundException('Merchant order not found');
      }
      if (order.status !== MerchantOrderStatus.OPEN) {
        throw new BadRequestException(`Merchant order is ${order.status}`);
      }
      if (order.expiresAt && order.expiresAt.getTime() < Date.now()) {
        order.status = MerchantOrderStatus.EXPIRED;
        await manager.getRepository(MerchantOrder).save(order);
        throw new BadRequestException('Merchant order has expired');
      }

      const amount = BigInt(order.amount);
      const recipientKey = `merchant:${merchantId}`;
      await this.risk.preCheck({
        userId: customer.id,
        kycTier: customer.kycTier,
        amount,
        fee: 0n,
        recipientKey,
        channel: 'user',
      });

      const saved = await manager.getRepository(Transfer).save(
        manager.getRepository(Transfer).create({
          idempotencyKey: `terminal:${order.id}`,
          type: TransferType.MERCHANT,
          status: TransferStatus.COMPLETED,
          sourceAccountId: source.id,
          destinationAccountId: merchantAccount.id,
          initiatedByUserId: customer.id,
          recipientName: merchant.businessName,
          amount: order.amount,
          fee: '0',
          currency: DEFAULT_CURRENCY,
          metadata: {
            recipientKey,
            channel: 'biometric',
            orderReference: order.reference,
            biometricTypes: input.biometricTypes,
          },
        }),
      );

      await this.ledger.post(manager, {
        idempotencyKey: `transfer:${saved.id}`,
        type: LedgerTransactionType.MERCHANT_PAYMENT,
        reference: saved.id,
        currency: saved.currency,
        metadata: { transferId: saved.id, orderReference: order.reference, channel: 'biometric' },
        legs: [
          { accountId: source.id, direction: LedgerDirection.DEBIT, amount },
          { accountId: merchantAccount.id, direction: LedgerDirection.CREDIT, amount },
        ],
      });

      order.status = MerchantOrderStatus.PAID;
      order.paidByUserId = customer.id;
      order.transferId = saved.id;
      await manager.getRepository(MerchantOrder).save(order);
      return { transfer: saved };
    });

    await this.notifyMerchantPaid(merchantId, transfer);
    return { transfer: presentTransfer(transfer) };
  }

  private async notifyMerchantPaid(merchantId: string, transfer: Transfer): Promise<void> {
    try {
      const merchant = await this.merchants.findOne({ where: { id: merchantId } });
      if (!merchant?.ownerUserId) {
        return;
      }
      const orderReference = transfer.metadata?.orderReference as string | undefined;
      await this.notifications.send(
        merchant.ownerUserId,
        'Payment received',
        `You received NGN ${formatMinor(BigInt(transfer.amount))}${
          orderReference ? ` for order ${orderReference}` : ''
        }.`,
        [
          { type: 'sms', enabled: true },
          { type: 'push', enabled: true },
          { type: 'in_app', enabled: true },
        ],
        { kind: 'merchant_payment', transferId: transfer.id, orderReference },
      );
    } catch (error) {
      this.logger.warn(
        `Merchant payment notification failed for transfer=${transfer.id}: ${String(error)}`,
      );
    }
  }

  private async executeBank(userId: string, transferId: string, signature: string) {
    const pending = await this.ledger.runInTransaction(async (manager) => {
      const locked = await this.lockDraft(manager, userId, transferId);
      await this.consumeForTransfer(manager, locked, signature, ChallengeType.TRANSFER);
      await this.riskCheck(locked);

      const total = BigInt(locked.amount) + BigInt(locked.fee);
      await this.ledger.createHold(manager, {
        accountId: locked.sourceAccountId!,
        amount: total,
        reference: `transfer:${locked.id}`,
      });

      locked.status = TransferStatus.PENDING;
      locked.pagaReference = `paga_${locked.id}`;
      return manager.getRepository(Transfer).save(locked);
    });

    const result = await this.requestPayout(pending);
    if (!result) {
      return { transfer: presentTransfer(pending) };
    }

    if (result.status === 'completed') {
      const completed = await this.completeBankTransfer(pending.id, result.providerReference);
      return { transfer: presentTransfer(completed) };
    }

    if (result.status === 'failed') {
      const failed = await this.failBankTransfer(
        pending.id,
        result.failureReason ?? 'Paga rejected the payout',
      );
      return { transfer: presentTransfer(failed) };
    }

    return { transfer: presentTransfer(pending) };
  }

  private async requestPayout(pending: Transfer) {
    try {
      return await this.paga.depositToBank({
        amountMinor: BigInt(pending.amount),
        reference: pending.pagaReference!,
        bankUuid: (pending.metadata?.bankUuid as string | undefined) ?? undefined,
        bankCode: pending.recipientBankCode!,
        accountNumber: pending.recipientAccountNumber!,
        accountName: pending.recipientName ?? '',
        narration: 'Vireo transfer',
      });
    } catch (error) {
      if (error instanceof BadGatewayException) {
        // Ambiguous outcome: Paga may have accepted the payout before the
        // connection failed. Keep the transfer PENDING (funds held) and let
        // reconciliation or the callback resolve it.
        this.logger.warn(
          `Paga payout outcome unknown for transfer=${pending.id}: ${String(error)}`,
        );
        return null;
      }
      await this.failBankTransfer(pending.id, 'Paga payout request failed');
      throw error;
    }
  }

  async handlePayoutCallback(
    reference: string,
    success: boolean,
    providerReference: string,
    reason?: string,
  ): Promise<boolean> {
    if (!reference.startsWith('paga_')) {
      return false;
    }
    const transfer = await this.transfers.findOne({ where: { pagaReference: reference } });
    if (!transfer) {
      return false;
    }
    if (success) {
      await this.completeBankTransfer(transfer.id, providerReference || reference);
    } else {
      await this.failBankTransfer(transfer.id, reason ?? 'Paga reported failure');
    }
    return true;
  }

  async completeBankTransfer(transferId: string, providerReference: string): Promise<Transfer> {
    return this.ledger.runInTransaction(async (manager) => {
      const locked = await manager.getRepository(Transfer).findOne({
        where: { id: transferId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Transfer not found');
      }
      if (locked.status === TransferStatus.COMPLETED) {
        return locked;
      }
      if (locked.status !== TransferStatus.PENDING) {
        throw new BadRequestException(`Transfer is ${locked.status}`);
      }

      const hold = await manager.getRepository(Hold).findOne({
        where: { reference: `transfer:${locked.id}`, status: HoldStatus.ACTIVE },
      });
      if (hold) {
        await this.ledger.captureHold(manager, hold.id);
      }

      const amount = BigInt(locked.amount);
      const fee = BigInt(locked.fee);
      const legs = [
        {
          accountId: locked.sourceAccountId!,
          direction: LedgerDirection.DEBIT,
          amount: amount + fee,
        },
        {
          accountId: SYSTEM_PAGA_POOL_ACCOUNT_ID,
          direction: LedgerDirection.CREDIT,
          amount,
        },
        ...(fee > 0n
          ? [
              {
                accountId: SYSTEM_FEE_INCOME_ACCOUNT_ID,
                direction: LedgerDirection.CREDIT,
                amount: fee,
              },
            ]
          : []),
      ];

      await this.ledger.post(manager, {
        idempotencyKey: `transfer:${locked.id}`,
        type: LedgerTransactionType.BANK_TRANSFER,
        reference: locked.id,
        currency: locked.currency,
        metadata: { transferId: locked.id, pagaReference: providerReference },
        legs,
      });

      locked.status = TransferStatus.COMPLETED;
      locked.pagaReference = providerReference;
      return manager.getRepository(Transfer).save(locked);
    });
  }

  async failBankTransfer(transferId: string, reason: string): Promise<Transfer> {
    return this.ledger.runInTransaction(async (manager) => {
      const locked = await manager.getRepository(Transfer).findOne({
        where: { id: transferId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) {
        throw new NotFoundException('Transfer not found');
      }
      if (locked.status === TransferStatus.COMPLETED || locked.status === TransferStatus.FAILED) {
        return locked;
      }
      const hold = await manager.getRepository(Hold).findOne({
        where: { reference: `transfer:${locked.id}`, status: HoldStatus.ACTIVE },
      });
      if (hold) {
        await this.ledger.releaseHold(manager, hold.id);
      }
      locked.status = TransferStatus.FAILED;
      locked.failureReason = reason;
      return manager.getRepository(Transfer).save(locked);
    });
  }

  private async lockDraft(
    manager: EntityManager,
    userId: string,
    transferId: string,
  ): Promise<Transfer> {
    const transfer = await manager.getRepository(Transfer).findOne({
      where: { id: transferId, initiatedByUserId: userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }
    if (transfer.status !== TransferStatus.DRAFT) {
      throw new BadRequestException(`Transfer is already ${transfer.status}`);
    }
    if (!transfer.challengeId) {
      throw new BadRequestException('Transfer has no challenge');
    }
    return transfer;
  }

  private async consumeForTransfer(
    manager: EntityManager,
    transfer: Transfer,
    signature: string,
    type: ChallengeType,
  ): Promise<void> {
    const challenge = await manager.getRepository(Challenge).findOne({
      where: { id: transfer.challengeId! },
    });
    if (!challenge) {
      throw new NotFoundException('Challenge not found');
    }
    if (challenge.payload.transferId !== transfer.id) {
      throw new BadRequestException('Challenge is not bound to this transfer');
    }
    if (challenge.payload.amountMinor !== transfer.amount) {
      throw new BadRequestException('Challenge amount does not match the transfer');
    }

    await this.challenges.consume(manager, {
      challengeId: transfer.challengeId!,
      userId: transfer.initiatedByUserId!,
      type,
      expectedPayload: challenge.payload,
      signature,
    });
  }

  private async riskCheck(transfer: Transfer): Promise<void> {
    const user = await this.users.findOne({ where: { id: transfer.initiatedByUserId! } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const recipientKey = (transfer.metadata?.recipientKey as string) ?? transfer.id;
    const channel = (transfer.metadata?.channel as 'user' | 'agent') ?? 'user';
    await this.risk.preCheck({
      userId: user.id,
      kycTier: user.kycTier,
      amount: BigInt(transfer.amount),
      fee: BigInt(transfer.fee),
      recipientKey,
      channel,
    });
  }

  private buildChallengePayload(transfer: Transfer): Record<string, unknown> {
    return {
      transferId: transfer.id,
      type: transfer.type,
      amountMinor: transfer.amount,
      feeMinor: transfer.fee,
      currency: transfer.currency,
      recipient: transfer.recipientName,
    };
  }

  private async resolveInternalRecipient(
    userId: string,
    dto: CreateTransferDraftDto,
  ): Promise<{ walletId: string; name: string; phone: string; key: string }> {
    let recipient: User | null = null;
    if (dto.recipientUserId) {
      recipient = await this.users.findOne({ where: { id: dto.recipientUserId } });
    } else if (dto.recipientPhone) {
      recipient = await this.users.findOne({
        where: { phone: normalizePhone(dto.recipientPhone) },
      });
    } else if (dto.recipientHandle) {
      recipient = await this.users.findOne({
        where: { handle: dto.recipientHandle.toLowerCase() },
      });
    } else {
      throw new BadRequestException('A recipient is required for internal transfers');
    }

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }
    if (recipient.id === userId) {
      throw new BadRequestException('Cannot transfer to yourself');
    }
    const wallet = await this.accounts.getWallet(recipient.id);
    return {
      walletId: wallet.id,
      name: recipient.name,
      phone: recipient.phone,
      key: `user:${recipient.id}`,
    };
  }

  private async getUser(userId: string): Promise<User> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async findChallenge(challengeId: string): Promise<Challenge | null> {
    return this.transfers.manager.getRepository(Challenge).findOne({
      where: { id: challengeId },
    });
  }
}

function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  return trimmed.startsWith('+')
    ? `+${trimmed.slice(1).replace(/\D/g, '')}`
    : trimmed.replace(/\D/g, '');
}

export function presentTransfer(transfer: Transfer) {
  return {
    id: transfer.id,
    type: transfer.type,
    status: transfer.status,
    amount: formatMinor(BigInt(transfer.amount)),
    fee: formatMinor(BigInt(transfer.fee)),
    currency: transfer.currency,
    recipientName: transfer.recipientName,
    recipientPhone: transfer.recipientPhone,
    recipientBankCode: transfer.recipientBankCode,
    recipientAccountNumber: transfer.recipientAccountNumber,
    pagaReference: transfer.pagaReference,
    failureReason: transfer.failureReason,
    challengeId: transfer.challengeId,
    createdAt: transfer.createdAt,
    updatedAt: transfer.updatedAt,
  };
}

export function presentChallenge(challenge: Challenge) {
  return {
    id: challenge.id,
    type: challenge.type,
    nonce: challenge.nonce,
    payload: challenge.payload,
    payloadHash: challenge.payloadHash,
    expiresAt: challenge.expiresAt,
  };
}
