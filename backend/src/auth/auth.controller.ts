import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import {
  EmailOtpRequestDto,
  EmailOtpVerifyDto,
  LoginDto,
  RegisterDeviceDto,
  RegisterDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('email-otp/request')
  requestEmailOtp(@Body() dto: EmailOtpRequestDto) {
    return this.auth.requestEmailOtp(dto.email);
  }

  @Post('email-otp/verify')
  verifyEmailOtp(@Body() dto: EmailOtpVerifyDto) {
    return this.auth.verifyEmailOtp(dto.email, dto.code);
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
