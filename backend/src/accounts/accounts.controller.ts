import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { formatMinor } from '../database/money';
import { LedgerService } from '../ledger/ledger.service';
import { AccountsService } from './accounts.service';

@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly ledger: LedgerService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    const wallet = await this.accounts.getWallet(user.userId);
    const balance = await this.ledger.getBalance(wallet.id);
    const virtualAccount = await this.accounts.getVirtualAccountForAccount(wallet.id);
    return {
      accountId: wallet.id,
      currency: wallet.currency,
      balance: formatMinor(balance.balance),
      held: formatMinor(balance.held),
      available: formatMinor(balance.available),
      /** Part of the balance held back until more identity verification is done. */
      restricted: formatMinor(await this.accounts.restrictedFor(wallet.id)),
      virtualAccount: virtualAccount
        ? {
            accountNumber: virtualAccount.accountNumber,
            bankName: virtualAccount.bankName,
            status: virtualAccount.status,
          }
        : null,
    };
  }
}
