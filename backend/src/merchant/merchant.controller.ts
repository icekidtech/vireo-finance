import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import {
  CreateOrderDto,
  CreateSettlementDraftDto,
  OnboardMerchantDto,
  SubmitSettlementDto,
  VerifyKybDto,
} from './dto/merchant.dto';
import { MerchantService } from './merchant.service';

@UseGuards(JwtAuthGuard)
@Controller('merchants')
export class MerchantController {
  constructor(private readonly merchants: MerchantService) {}

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get()
  listAll() {
    return this.merchants.listAllMerchants();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/kyb')
  verifyKyb(@Param('id') id: string, @Body() dto: VerifyKybDto) {
    return this.merchants.verifyKyb(id, dto.status);
  }

  @Post()
  onboard(@CurrentUser() user: AuthenticatedUser, @Body() dto: OnboardMerchantDto) {
    return this.merchants.onboard(user.userId, dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.merchants.getProfile(user.userId);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.merchants.dashboard(user.userId);
  }

  @Get('orders')
  listOrders(@CurrentUser() user: AuthenticatedUser) {
    return this.merchants.listOrders(user.userId);
  }

  @Post('orders')
  createOrder(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrderDto) {
    return this.merchants.createOrder(user.userId, dto);
  }

  @Post('orders/:reference/cancel')
  cancelOrder(@CurrentUser() user: AuthenticatedUser, @Param('reference') reference: string) {
    return this.merchants.cancelOrder(user.userId, reference);
  }

  @Get('settlements')
  listSettlements(@CurrentUser() user: AuthenticatedUser) {
    return this.merchants.listSettlements(user.userId);
  }

  @Post('settlements/drafts')
  createSettlementDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSettlementDraftDto,
  ) {
    return this.merchants.createSettlementDraft(user.userId, dto);
  }

  @Post('settlements/:id/submit')
  submitSettlement(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitSettlementDto,
  ) {
    return this.merchants.submitSettlement(user.userId, id, dto.signature);
  }
}
