import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { formatMinor } from '../database/money';
import type { AppConfig } from '../config/configuration';

export type TransferChannel = 'user' | 'agent';

export interface RiskCheckInput {
  userId: string;
  kycTier: number;
  amount: bigint;
  fee: bigint;
  recipientKey: string;
  channel: TransferChannel;
}

@Injectable()
export class RiskService {
  private readonly risk: AppConfig['risk'];

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.risk = config.get<AppConfig['risk']>('risk')!;
  }

  async preCheck(input: RiskCheckInput): Promise<void> {
    if (input.amount <= 0n) {
      throw new ForbiddenException('Amount must be greater than zero');
    }
    if (input.amount > this.risk.singleTransferLimit) {
      throw new ForbiddenException(
        `Single transfer limit is ${formatMinor(this.risk.singleTransferLimit)} NGN`,
      );
    }

    const dailyLimit =
      this.risk.tierDailyLimits[input.kycTier] ?? this.risk.tierDailyLimits[0] ?? 0n;
    const dailyTotal = await this.dailyTotal(input.userId);
    if (dailyTotal + input.amount + input.fee > dailyLimit) {
      throw new ForbiddenException(
        `Daily limit for KYC tier ${input.kycTier} is ${formatMinor(dailyLimit)} NGN`,
      );
    }

    const recentCount = await this.recentTransferCount(input.userId);
    if (recentCount >= this.risk.velocityCount) {
      throw new ForbiddenException('Too many transfer attempts. Please try again later.');
    }

    if (input.channel === 'agent' && input.amount > this.risk.newPayeeLimit) {
      const isNew = await this.isNewPayee(input.userId, input.recipientKey);
      if (isNew) {
        throw new ForbiddenException(
          `New payees are limited to ${formatMinor(this.risk.newPayeeLimit)} NGN`,
        );
      }
    }
  }

  async isNewPayee(userId: string, recipientKey: string): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1
       FROM "transfers"
       WHERE "initiatedByUserId" = $1
         AND "status" = 'completed'
         AND "metadata"->>'recipientKey' = $2
       LIMIT 1`,
      [userId, recipientKey],
    );
    return rows.length === 0;
  }

  private async dailyTotal(userId: string): Promise<bigint> {
    const rows = await this.dataSource.query(
      `SELECT COALESCE(SUM("amount" + "fee"), 0)::text AS total
       FROM "transfers"
       WHERE "initiatedByUserId" = $1
         AND "status" IN ('pending', 'completed')
         AND "createdAt" >= now() - interval '24 hours'`,
      [userId],
    );
    return BigInt(rows[0]?.total ?? '0');
  }

  private async recentTransferCount(userId: string): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM "transfers"
       WHERE "initiatedByUserId" = $1
         AND "status" IN ('pending', 'completed', 'draft')
         AND "createdAt" >= now() - ($2 || ' minutes')::interval`,
      [userId, this.risk.velocityWindowMinutes.toString()],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
