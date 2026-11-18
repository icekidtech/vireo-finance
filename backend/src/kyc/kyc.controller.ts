import { Body, Controller, Get, Post, UseGuards, Param, Patch } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { KycService } from './kyc.service';
import {
  SubmitKycDto,
  VerifyBvnDto,
  VerifyKycDto,
  VerifyTier2Dto,
  VerifyTier3Dto,
} from './kyc.dto';

@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @UseGuards(JwtAuthGuard)
  @Post('submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitKycDto) {
    return this.kyc.submitKyc(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('bvn')
  verifyBvn(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyBvnDto) {
    return this.kyc.verifyBvn(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('nin')
  verifyNin(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyTier2Dto) {
    return this.kyc.verifyNinAndId(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('address')
  verifyAddress(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyTier3Dto) {
    return this.kyc.verifyAddress(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tiers')
  tiers(@CurrentUser() user: AuthenticatedUser) {
    return this.kyc.getTiers(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.kyc.getUserKycStatus(user.userId);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get('pending')
  listPending() {
    return this.kyc.listPendingKyc();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/verify')
  verify(@Param('id') id: string, @Body() dto: VerifyKycDto) {
    return this.kyc.verifyKyc(id, dto);
  }
}
