import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateOrderDto, OnboardMerchantDto, SettleDto } from './dto/merchant.dto';
import { MerchantService } from './merchant.service';

@UseGuards(JwtAuthGuard)
@Controller('merchants')
export class MerchantController {
  constructor(private readonly merchants: MerchantService) {}

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

  @Get('settlements')
  listSettlements(@CurrentUser() user: AuthenticatedUser) {
    return this.merchants.listSettlements(user.userId);
  }

  @Post('settlements')
  settle(@CurrentUser() user: AuthenticatedUser, @Body() dto: SettleDto) {
    return this.merchants.settle(user.userId, dto.amount);
  }
}
