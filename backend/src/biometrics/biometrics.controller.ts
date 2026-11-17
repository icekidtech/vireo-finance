import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BiometricsService } from './biometrics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  EnrollBiometricDto,
  GrantConsentDto,
  RevokeBiometricDto,
} from './dto/enroll-biometric.dto';
import { AttemptContext } from './biometric-attempt.entity';

@Controller('biometrics')
export class BiometricsController {
  constructor(private readonly biometrics: BiometricsService) {}

  /**
   * Grant consent for biometric data collection.
   */
  @Post('consent')
  @UseGuards(JwtAuthGuard)
  async grantConsent(@Request() req, @Body() dto: GrantConsentDto) {
    const consent = await this.biometrics.grantConsent(req.user.userId, dto);
    return {
      id: consent.id,
      status: consent.status,
      consentVersion: consent.consentVersion,
      createdAt: consent.createdAt,
    };
  }

  /**
   * Revoke consent and delete all biometric enrollments.
   */
  @Delete('consent')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeConsent(@Request() req) {
    await this.biometrics.revokeConsent(req.user.userId, 'User requested deletion');
  }

  /**
   * Enroll a new biometric (face or voice).
   */
  @Post('enroll')
  @UseGuards(JwtAuthGuard)
  async enroll(@Request() req, @Body() dto: EnrollBiometricDto) {
    const enrollment = await this.biometrics.enroll(req.user.userId, dto);
    return {
      id: enrollment.id,
      type: enrollment.type,
      status: enrollment.status,
      qualityScore: enrollment.qualityScore,
      createdAt: enrollment.createdAt,
    };
  }

  /**
   * List all biometric enrollments for the authenticated user.
   */
  @Get('enrollments')
  @UseGuards(JwtAuthGuard)
  async listEnrollments(@Request() req) {
    const enrollments = await this.biometrics.listEnrollments(req.user.userId);
    return {
      enrollments: enrollments.map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        qualityScore: e.qualityScore,
        modelVersion: e.modelVersion,
        createdAt: e.createdAt,
        revokedAt: e.revokedAt,
      })),
    };
  }

  /**
   * Revoke a specific biometric enrollment.
   */
  @Delete('enrollments')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeEnrollment(@Request() req, @Body() dto: RevokeBiometricDto) {
    await this.biometrics.revokeEnrollment(req.user.userId, dto);
  }

  /**
   * Get recent biometric verification attempts (for user audit).
   */
  @Get('attempts')
  @UseGuards(JwtAuthGuard)
  async getAttempts(@Request() req) {
    const attempts = await this.biometrics.getAttempts(req.user.userId, 50);
    return {
      attempts: attempts.map((a) => ({
        id: a.id,
        type: a.type,
        result: a.result,
        context: a.context,
        matchScore: a.matchScore,
        livenessScore: a.livenessScore,
        spoofScore: a.spoofScore,
        qualityScore: a.qualityScore,
        createdAt: a.createdAt,
      })),
    };
  }
}
