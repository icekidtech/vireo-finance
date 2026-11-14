import { Body, Controller, Get, Post, UseGuards, Param, Patch } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { KycService } from './kyc.service';
import { SubmitKycDto, VerifyKycDto } from './kyc.dto';

@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @UseGuards(JwtAuthGuard)
  @Post('submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitKycDto) {
    return this.kyc.submitKyc(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.kyc.getUserKycStatus(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pending')
  listPending() {
    return this.kyc.listPendingKyc();
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/verify')
  verify(@Param('id') id: string, @Body() dto: VerifyKycDto) {
    return this.kyc.verifyKyc(id, dto);
  }
}
