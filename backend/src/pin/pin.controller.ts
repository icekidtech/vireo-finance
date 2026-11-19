import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, Matches } from 'class-validator';
import { AuthenticatedUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { PinService } from './pin.service';

class SetPinDto {
  @IsString()
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  pin: string;

  /** Required when a PIN is already set. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'currentPin must be 4 digits' })
  currentPin?: string;
}

class ResetPinDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be the 6-digit code we sent you' })
  code: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'PIN must be exactly 4 digits' })
  pin: string;
}

@UseGuards(JwtAuthGuard)
@Controller('pin')
export class PinController {
  constructor(
    private readonly pins: PinService,
    private readonly auth: AuthService,
  ) {}

  @Get('status')
  status(@CurrentUser() user: AuthenticatedUser) {
    return this.pins.status(user.userId);
  }

  @Post()
  @HttpCode(204)
  async set(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPinDto) {
    await this.pins.set(user.userId, dto.pin, dto.currentPin);
  }

  /** Forgotten PIN, step 1: email a one-time code to the signed-in user. Nothing is ever sent to a phone. */
  @Post('reset/code')
  @HttpCode(200)
  async resetCode(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.sendCodeToUser(user.userId);
  }

  /** Forgotten PIN, step 2: prove email ownership with that code, then choose a new PIN. */
  @Post('reset')
  @HttpCode(204)
  async reset(@CurrentUser() user: AuthenticatedUser, @Body() dto: ResetPinDto) {
    await this.auth.consumeOtpForUser(user.userId, dto.code);
    await this.pins.resetAfterOtp(user.userId, dto.pin);
  }
}
