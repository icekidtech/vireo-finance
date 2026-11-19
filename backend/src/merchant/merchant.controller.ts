import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import {
  CreateOrderDto,
  CreateSettlementDraftDto,
  OnboardMerchantDto,
  SubmitRegistrationDto,
  SubmitSettlementDto,
  UpdateMerchantDto,
  VerifyKybDto,
} from './dto/merchant.dto';
import { CreateFaceTerminalPaymentDto, CreateTerminalPaymentDto } from './dto/terminal-payment.dto';
import { TerminalPaymentService } from './terminal-payment.service';
import { MerchantVerificationService } from './merchant-verification.service';
import { MerchantDepositService } from './merchant-deposit.service';
import { MerchantService } from './merchant.service';

@UseGuards(JwtAuthGuard)
@Controller('merchants')
export class MerchantController {
  constructor(
    private readonly merchants: MerchantService,
    private readonly terminal: TerminalPaymentService,
    private readonly deposits: MerchantDepositService,
    private readonly verification: MerchantVerificationService,
  ) {}

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

  /** Money in and out of the business balance (not only orders and payouts). */
  @Get('me/activity')
  activity(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    return this.merchants.activity(user.userId, limit ? Number.parseInt(limit, 10) : 50);
  }

  @Get('me/levels')
  levels(@CurrentUser() user: AuthenticatedUser) {
    return this.verification.getLevels(user.userId);
  }

  @Post('me/registration')
  @HttpCode(200)
  submitRegistration(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitRegistrationDto) {
    return this.verification.submitRegistration(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/registration')
  reviewRegistration(@Param('id') id: string, @Body() dto: VerifyKybDto) {
    return this.verification.reviewRegistration(id, dto.status);
  }

  /** Re-checks whether this merchant now qualifies for automatic verification. */
  @Post('me/verification')
  @HttpCode(200)
  verify(@CurrentUser() user: AuthenticatedUser) {
    return this.verification.check(user.userId);
  }

  /** Bank account customers can transfer to; credited to the merchant balance. */
  @Get('me/deposit-account')
  depositAccount(@CurrentUser() user: AuthenticatedUser) {
    return this.deposits.getDepositAccount(user.userId);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMerchantDto) {
    return this.merchants.updateProfile(user.userId, dto);
  }

  /** Face/voice payment at the till. Always 200; the body's `status` is the outcome. */
  @Post('terminal-payment')
  @HttpCode(200)
  terminalPayment(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTerminalPaymentDto) {
    return this.terminal.pay(user.userId, dto);
  }

  /** Pay with just a face: the server finds the customer. Always 200; the body's `status` is the outcome. */
  @Post('terminal-payment/face')
  @HttpCode(200)
  terminalPaymentByFace(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFaceTerminalPaymentDto,
  ) {
    return this.terminal.payByFace(user.userId, dto);
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
    return this.merchants.submitSettlement(user.userId, id, dto.signature, {
      approval: dto.approval ?? 'biometric',
      pin: dto.pin,
    });
  }
}
