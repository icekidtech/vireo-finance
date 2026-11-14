import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateTransferDraftDto, SubmitTransferDto } from './dto/transfers.dto';
import { TransfersService } from './transfers.service';

@UseGuards(JwtAuthGuard)
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post('drafts')
  createDraft(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTransferDraftDto) {
    return this.transfers.createDraft(user.userId, dto);
  }

  @Post(':id/submit')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitTransferDto,
  ) {
    return this.transfers.submit(user.userId, id, dto.signature);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    return this.transfers.list(user.userId, limit ? Number.parseInt(limit, 10) : 50);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfers.get(user.userId, id);
  }
}
