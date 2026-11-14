import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { LedgerService } from './ledger.service';

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('balance')
  async balance(@CurrentUser() user: AuthenticatedUser, @Query('accountId') accountId?: string) {
    const id = accountId;
    if (!id) {
      throw new Error('accountId is required');
    }
    return this.ledger.getBalance(id);
  }

  @Get('entries')
  async entries(
    @CurrentUser() user: AuthenticatedUser,
    @Query('accountId') accountId?: string,
    @Query('limit') limit?: string,
  ) {
    const id = accountId;
    if (!id) {
      throw new Error('accountId is required');
    }
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
    return this.ledger.getAccountEntries(id, parsedLimit);
  }
}
