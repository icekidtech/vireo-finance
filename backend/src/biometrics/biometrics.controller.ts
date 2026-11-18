import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { BiometricsService } from './biometrics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { AttemptContext } from './biometric-attempt.entity';
import {
  EnrollBiometricDto,
  GrantConsentDto,
  RevokeBiometricDto,
  IdentifyBiometricDto,
} from './dto/enroll-biometric.dto';

@Controller('biometrics')
export class BiometricsController {
  constructor(private readonly biometrics: BiometricsService) {}

  /**
   * Grant consent for biometric data collection.
   */
  @Post('consent')
  @UseGuards(JwtAuthGuard)
  async grantConsent(@CurrentUser() user: AuthenticatedUser, @Body() dto: GrantConsentDto) {
    const consent = await this.biometrics.grantConsent(user.userId, dto);
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
  async revokeConsent(@CurrentUser() user: AuthenticatedUser) {
    await this.biometrics.revokeConsent(user.userId, 'User requested deletion');
  }

  /**
   * Enroll a new biometric (face or voice).
   */
  @Post('enroll')
  @UseGuards(JwtAuthGuard)
  async enroll(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnrollBiometricDto) {
    const enrollment = await this.biometrics.enroll(user.userId, dto);
    return {
      id: enrollment.id,
      type: enrollment.type,
      status: enrollment.status,
      qualityScore: enrollment.qualityScore,
      createdAt: enrollment.createdAt,
    };
  }

  /** Whether biometrics are configured on this server (no personal data). */
  @Get('status')
  @UseGuards(JwtAuthGuard)
  status() {
    return this.biometrics.status();
  }

  /**
   * List all biometric enrollments for the authenticated user.
   */
  @Get('enrollments')
  @UseGuards(JwtAuthGuard)
  async listEnrollments(@CurrentUser() user: AuthenticatedUser) {
    const enrollments = await this.biometrics.listEnrollments(user.userId);
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
  async revokeEnrollment(@CurrentUser() user: AuthenticatedUser, @Body() dto: RevokeBiometricDto) {
    await this.biometrics.revokeEnrollment(user.userId, dto);
  }

  /**
   * Get recent biometric verification attempts (for user audit).
   */
  @Get('attempts')
  @UseGuards(JwtAuthGuard)
  async getAttempts(@CurrentUser() user: AuthenticatedUser) {
    const attempts = await this.biometrics.getAttempts(user.userId, 50);
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

  /**
   * Identify user by face (1:N search) - TRUE DEVICELESS PAYMENT.
   * No identifier needed - just scan the face.
   * 
   * This endpoint is typically called by merchant terminals, not end users.
   * It requires special merchant authentication (not implemented yet).
   */
  @Post('identify')
  @HttpCode(HttpStatus.OK)
  async identifyByFace(@Body() dto: IdentifyBiometricDto) {
    const result = await this.biometrics.identifyByFace(
      dto.sampleBase64,
      AttemptContext.PAYMENT,
      dto.amountMinor,
    );

    return {
      decision: result.decision,
      userId: result.userId,
      scores: {
        matchScore: result.scores.matchScore,
        livenessScore: result.scores.livenessScore,
        spoofScore: result.scores.spoofScore,
        qualityScore: result.scores.qualityScore,
      },
      reason: result.reason,
    };
  }
}
