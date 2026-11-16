import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from '../accounts/account.entity';
import { AccountOwnerType, AccountStatus, AccountType } from '../common/enums';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LedgerService } from './ledger.service';

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
  ) {}

  @Get('balance')
  async balance(@CurrentUser() user: AuthenticatedUser, @Query('accountId') accountId?: string) {
    return this.ledger.getBalance(await this.resolveAccountId(user.userId, accountId));
  }

  @Get('entries')
  async entries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
  ) {
    const id = await this.resolveAccountId(user.userId, accountId);
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
    return this.ledger.getAccountEntries(id, parsedLimit);
  }

  /**
   * Ledger reads are scoped to accounts the caller owns. Omitting accountId
   * resolves to the caller's wallet, so clients never need to know their id.
   */
  private async resolveAccountId(userId: string, accountId?: string): Promise<string> {
    if (!accountId) {
      const wallet = await this.accounts.findOne({
        where: {
          ownerType: AccountOwnerType.USER,
          ownerId: userId,
          accountType: AccountType.WALLET,
          status: AccountStatus.ACTIVE,
        },
      });
      if (!wallet) {
        throw new NotFoundException('Wallet not found for user');
      }
      return wallet.id;
    }

    const owned = await this.accounts.findOne({
      where: { id: accountId, ownerType: AccountOwnerType.USER, ownerId: userId },
    });
    if (!owned) {
      throw new NotFoundException('Account not found');
    }
    return owned.id;
  }
}