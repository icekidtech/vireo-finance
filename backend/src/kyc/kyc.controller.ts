import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SubmitIdentificationDto } from './dto/kyc.dto';
import { KycService } from './kyc.service';

@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Post('identification')
  submitIdentification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitIdentificationDto,
  ) {
    return this.kyc.submitIdentification(user.userId, dto);
  }

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.kyc.getKycStatus(user.userId);
  }

  @Get('history')
  getHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.kyc.listKycHistory(user.userId);
  }
}
