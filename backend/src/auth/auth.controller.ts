import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { OtpRequestDto, OtpVerifyDto, RegisterDeviceDto, RegisterDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('otp/request')
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp(dto.phone);
  }

  @Post('otp/verify')
  verifyOtp(@Body() dto: OtpVerifyDto) {
    return this.auth.verifyOtp(dto.phone, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getProfile(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('devices')
  registerDevice(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterDeviceDto) {
    return this.auth.registerDevice(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('devices')
  listDevices(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listDevices(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('devices/:id/revoke')
  revokeDevice(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.auth.revokeDevice(user.userId, id);
  }
}
