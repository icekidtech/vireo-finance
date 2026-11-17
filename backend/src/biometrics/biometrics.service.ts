import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  NotImplementedException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BiometricEnrollment, BiometricType, BiometricStatus } from './biometric-enrollment.entity';
import { BiometricConsent, ConsentStatus, ConsentPurpose } from './biometric-consent.entity';
import { BiometricAttempt, AttemptResult, AttemptContext } from './biometric-attempt.entity';
import { User } from '../users/user.entity';
import {
  EnrollBiometricDto,
  VerifyBiometricDto,
  GrantConsentDto,
  RevokeBiometricDto,
} from './dto/enroll-biometric.dto';
import { encryptEmbedding, decryptEmbedding } from '../common/crypto';

interface BiometricScores {
  matchScore: number;
  livenessScore: number;
  spoofScore: number;
  qualityScore: number;
}

export interface FusionResult {
  decision: AttemptResult;
  /** Resolved customer, set whenever the identifier matched a user. */
  userId?: string;
  scores: BiometricScores;
  matchedEnrollmentId?: string;
  reason?: string;
}

@Injectable()
export class BiometricsService {
  private readonly logger = new Logger(BiometricsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(BiometricEnrollment)
    private readonly enrollments: Repository<BiometricEnrollment>,
    @InjectRepository(BiometricConsent)
    private readonly consents: Repository<BiometricConsent>,
    @InjectRepository(BiometricAttempt)
    private readonly attempts: Repository<BiometricAttempt>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Grant explicit consent for biometric data collection.
   */
  async grantConsent(userId: string, dto: GrantConsentDto): Promise<BiometricConsent> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Revoke any previous consents (user can only have one active consent)
    await this.consents.update(
      { userId, status: ConsentStatus.GRANTED },
      { status: ConsentStatus.REVOKED, revokedAt: new Date() },
    );

    const consentText = this.getConsentText(dto.consentVersion);
    const consent = await this.consents.save(
      this.consents.create({
        userId,
        status: ConsentStatus.GRANTED,
        purpose: ConsentPurpose.BOTH,
        consentText,
        consentVersion: dto.consentVersion,
        metadata: dto.metadata ?? null,
      }),
    );

    return consent;
  }

  /**
   * Revoke consent and all associated biometric enrollments.
   */
  async revokeConsent(userId: string, reason?: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Revoke all active consents
      await manager.getRepository(BiometricConsent).update(
        { userId, status: ConsentStatus.GRANTED },
        {
          status: ConsentStatus.REVOKED,
          revokedAt: new Date(),
          revokedReason: reason ?? null,
        },
      );

      // Revoke all active biometric enrollments
      await manager
        .getRepository(BiometricEnrollment)
        .update(
          { userId, status: BiometricStatus.ACTIVE },
          { status: BiometricStatus.REVOKED, revokedAt: new Date() },
        );
    });

    this.logger.log(`Consent and enrollments revoked for user ${userId}`);
  }

  /**
   * Enroll a new biometric (face or voice).
   */
  async enroll(userId: string, dto: EnrollBiometricDto): Promise<BiometricEnrollment> {
    this.assertProviderReady();
    // Verify consent exists and is active
    const consent = await this.consents.findOne({
      where: { id: dto.consentId, userId, status: ConsentStatus.GRANTED },
    });
    if (!consent) {
      throw new ForbiddenException('Valid consent is required before enrolling biometrics');
    }

    // Process the biometric sample into an embedding
    const { embedding, qualityScore } = await this.processEnrollment(dto.type, dto.sampleBase64);

    if (qualityScore < this.getMinQualityScore()) {
      throw new BadRequestException(
        `Biometric quality too low (${qualityScore}/100). Please try again in better conditions.`,
      );
    }

    // Encrypt the embedding before storing
    const embeddingEncrypted = encryptEmbedding(embedding);

    // Revoke existing enrollments of this type (users can re-enroll)
    await this.enrollments.update(
      { userId, type: dto.type, status: BiometricStatus.ACTIVE },
      { status: BiometricStatus.REVOKED, revokedAt: new Date() },
    );

    const enrollment = await this.enrollments.save(
      this.enrollments.create({
        userId,
        type: dto.type,
        status: BiometricStatus.ACTIVE,
        embeddingEncrypted,
        consentId: dto.consentId,
        modelVersion: this.getCurrentModelVersion(),
        qualityScore,
        metadata: dto.metadata ?? null,
      }),
    );

    this.logger.log(`Biometric ${dto.type} enrolled for user ${userId}`);
    return enrollment;
  }

  /**
   * Verify a biometric sample against stored enrollments.
   * Returns a decision: approved, denied, or step_up.
   */
  async verify(dto: VerifyBiometricDto, context: AttemptContext): Promise<FusionResult> {
    this.assertProviderReady();
    // Look up user by identifier (phone or handle)
    const user = await this.findUserByIdentifier(dto.identifier);
    if (!user) {
      // For security, always perform a fake verification to prevent timing attacks
      await this.fakeVerification();
      return this.logAttempt(null, dto.type, AttemptResult.DENIED, context, {
        matchScore: 0,
        livenessScore: 0,
        spoofScore: 100,
        qualityScore: 0,
      });
    }

    // Lock out a customer after repeated denials so a terminal cannot be used
    // to brute-force or probe their biometrics.
    if (await this.isLockedOut(user.id)) {
      return {
        decision: AttemptResult.DENIED,
        userId: user.id,
        scores: { matchScore: 0, livenessScore: 0, spoofScore: 0, qualityScore: 0 },
        reason: 'Too many failed attempts',
      };
    }

    // Check if user has active consent
    const hasConsent = await this.hasActiveConsent(user.id);
    if (!hasConsent) {
      return {
        ...(await this.logAttempt(user.id, dto.type, AttemptResult.DENIED, context, {
          matchScore: 0,
          livenessScore: 0,
          spoofScore: 0,
          qualityScore: 0,
        })),
        userId: user.id,
      };
    }

    // Get active enrollments for this user and type
    const enrollments = await this.enrollments.find({
      where: { userId: user.id, type: dto.type, status: BiometricStatus.ACTIVE },
    });

    if (enrollments.length === 0) {
      return {
        ...(await this.logAttempt(user.id, dto.type, AttemptResult.DENIED, context, {
          matchScore: 0,
          livenessScore: 0,
          spoofScore: 0,
          qualityScore: 0,
        })),
        userId: user.id,
      };
    }

    // Process the verification sample
    const verificationResult = await this.processVerification(
      dto.type,
      dto.sampleBase64,
      enrollments,
    );

    // Apply score fusion to make a decision
    const fusionResult = this.scoreFusion(verificationResult, dto.amountMinor);

    // Log the attempt
    await this.logAttempt(
      user.id,
      dto.type,
      fusionResult.decision,
      context,
      fusionResult.scores,
      fusionResult.matchedEnrollmentId,
      dto.metadata,
    );

    return { ...fusionResult, userId: user.id };
  }

  /**
   * List all enrollments for a user.
   */
  async listEnrollments(userId: string): Promise<BiometricEnrollment[]> {
    return this.enrollments.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Revoke a specific biometric enrollment.
   */
  async revokeEnrollment(userId: string, dto: RevokeBiometricDto): Promise<void> {
    await this.enrollments.update(
      { userId, type: dto.type, status: BiometricStatus.ACTIVE },
      { status: BiometricStatus.REVOKED, revokedAt: new Date() },
    );
  }

  /**
   * Get recent verification attempts for a user (for debugging/auditing).
   */
  async getAttempts(userId: string, limit = 50): Promise<BiometricAttempt[]> {
    return this.attempts.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  // ===== Private Helper Methods =====

  private async processEnrollment(
    type: BiometricType,
    sampleBase64: string,
  ): Promise<{ embedding: string; qualityScore: number }> {
    // TODO: Integrate with actual biometric vendor SDK or ML model
    // For now, this is a placeholder that simulates processing

    if (type === BiometricType.FACE) {
      // In production: call face recognition service
      // - Detect face in image
      // - Extract face embedding (512-d or 128-d vector)
      // - Check liveness
      // - Return quality score
      this.logger.debug('Processing face enrollment (placeholder)');
      return {
        embedding: this.mockFaceEmbedding(sampleBase64),
        qualityScore: 85,
      };
    }

    if (type === BiometricType.VOICE) {
      // In production: call voice recognition service
      // - Extract voice features
      // - Generate speaker embedding (i-vector or x-vector)
      // - Check audio quality
      // - Return quality score
      this.logger.debug('Processing voice enrollment (placeholder)');
      return {
        embedding: this.mockVoiceEmbedding(sampleBase64),
        qualityScore: 80,
      };
    }

    throw new BadRequestException('Unsupported biometric type');
  }

  private async processVerification(
    type: BiometricType,
    sampleBase64: string,
    enrollments: BiometricEnrollment[],
  ): Promise<{
    matchScore: number;
    livenessScore: number;
    spoofScore: number;
    qualityScore: number;
    matchedEnrollmentId?: string;
  }> {
    // TODO: Integrate with actual biometric verification
    // - Extract embedding from sample
    // - Compare against each enrollment embedding
    // - Return best match score, liveness, spoof, and quality

    this.logger.debug(`Processing ${type} verification against ${enrollments.length} enrollments`);

    // Placeholder: simulate verification
    const mockScores = this.mockVerification(type, sampleBase64, enrollments);
    return mockScores;
  }

  private scoreFusion(
    verification: {
      matchScore: number;
      livenessScore: number;
      spoofScore: number;
      qualityScore: number;
      matchedEnrollmentId?: string;
    },
    amountMinor?: number,
  ): FusionResult {
    const thresholds = this.getThresholds(amountMinor);

    // Deny if spoof score is too high
    if (verification.spoofScore > thresholds.maxSpoofScore) {
      return {
        decision: AttemptResult.DENIED,
        scores: verification,
        reason: 'High spoof probability detected',
      };
    }

    // Deny if liveness score is too low
    if (verification.livenessScore < thresholds.minLivenessScore) {
      return {
        decision: AttemptResult.DENIED,
        scores: verification,
        reason: 'Liveness check failed',
      };
    }

    // Deny if match score is below threshold
    if (verification.matchScore < thresholds.minMatchScore) {
      return {
        decision: AttemptResult.DENIED,
        scores: verification,
        reason: 'No matching enrollment found',
      };
    }

    // Step-up if match score is in the uncertain range or high-value transaction
    if (
      verification.matchScore < thresholds.stepUpMatchScore ||
      (amountMinor && amountMinor > thresholds.stepUpAmountMinor)
    ) {
      return {
        decision: AttemptResult.STEP_UP,
        scores: verification,
        matchedEnrollmentId: verification.matchedEnrollmentId,
        reason: 'Additional verification required',
      };
    }

    // Approve if all checks pass
    return {
      decision: AttemptResult.APPROVED,
      scores: verification,
      matchedEnrollmentId: verification.matchedEnrollmentId,
    };
  }

  private async logAttempt(
    userId: string | null,
    type: BiometricType,
    result: AttemptResult,
    context: AttemptContext,
    scores: BiometricScores,
    matchedEnrollmentId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<FusionResult> {
    await this.attempts.save(
      this.attempts.create({
        userId,
        type,
        result,
        context,
        matchScore: scores.matchScore,
        livenessScore: scores.livenessScore,
        spoofScore: scores.spoofScore,
        qualityScore: scores.qualityScore,
        matchedEnrollmentId: matchedEnrollmentId ?? null,
        metadata: metadata ?? null,
      }),
    );

    return { decision: result, scores, matchedEnrollmentId };
  }

  /**
   * The mock provider returns passing scores for any sample, so it must never
   * back real money movement. Outside production it is allowed for development.
   */
  private assertProviderReady(): void {
    const provider = (process.env.BIOMETRIC_PROVIDER ?? 'mock').toLowerCase();
    if (provider === 'mock') {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException('Biometric verification is not available');
      }
      return;
    }
    // No adapter exists for any other provider yet: fail closed rather than
    // silently falling back to the mock scorer.
    throw new NotImplementedException(`Biometric provider "${provider}" is not implemented`);
  }

  private async isLockedOut(userId: string): Promise<boolean> {
    const windowMinutes = parseInt(process.env.BIOMETRIC_LOCKOUT_WINDOW_MINUTES ?? '15', 10);
    const maxDenials = parseInt(process.env.BIOMETRIC_LOCKOUT_MAX_DENIALS ?? '5', 10);
    const denials = await this.attempts.count({
      where: {
        userId,
        result: AttemptResult.DENIED,
        context: AttemptContext.PAYMENT,
        createdAt: MoreThan(new Date(Date.now() - windowMinutes * 60_000)),
      },
    });
    return denials >= maxDenials;
  }

  private async findUserByIdentifier(identifier: string): Promise<User | null> {
    const trimmed = identifier.trim();
    // Try phone number first
    if (trimmed.startsWith('+') || /^\d+$/.test(trimmed)) {
      return this.users.findOne({ where: { phone: trimmed } });
    }
    // Try handle
    return this.users.findOne({ where: { handle: trimmed.toLowerCase() } });
  }

  private async hasActiveConsent(userId: string): Promise<boolean> {
    const consent = await this.consents.findOne({
      where: { userId, status: ConsentStatus.GRANTED },
    });
    return !!consent;
  }

  private getThresholds(amountMinor?: number) {
    // Using environment variables directly until config type is updated
    const minMatchScore = parseInt(process.env.BIOMETRIC_MIN_MATCH_SCORE ?? '75', 10);
    const stepUpMatchScore = parseInt(process.env.BIOMETRIC_STEP_UP_MATCH_SCORE ?? '85', 10);
    const minLivenessScore = parseInt(process.env.BIOMETRIC_MIN_LIVENESS_SCORE ?? '70', 10);
    const maxSpoofScore = parseInt(process.env.BIOMETRIC_MAX_SPOOF_SCORE ?? '30', 10);
    const stepUpAmountMinor = parseInt(process.env.BIOMETRIC_STEP_UP_AMOUNT_MINOR ?? '5000000', 10);

    return {
      minMatchScore,
      stepUpMatchScore,
      minLivenessScore,
      maxSpoofScore,
      stepUpAmountMinor,
    };
  }

  private getMinQualityScore(): number {
    return parseInt(process.env.BIOMETRIC_MIN_QUALITY_SCORE ?? '60', 10);
  }

  private getCurrentModelVersion(): string {
    return process.env.BIOMETRIC_MODEL_VERSION ?? 'v1';
  }

  private getConsentText(version: string): string {
    // In production, load from a consent repository or CMS
    return `
Vireo Finance Biometric Data Consent (Version ${version})

By consenting, you authorize Vireo Finance to:
1. Collect and process your facial and/or voice biometric data
2. Store encrypted biometric templates for identity verification
3. Use your biometrics to authorize payments at merchant terminals
4. Retain your data until you revoke consent or close your account

You have the right to:
- Revoke consent at any time through the app settings
- Request deletion of all biometric data
- Access logs of biometric verification attempts

Your biometric data is encrypted, never shared with third parties, and used only for authentication purposes as described in our Privacy Policy.
    `.trim();
  }

  private async fakeVerification(): Promise<void> {
    // Simulate verification latency to prevent timing attacks
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
  }

  // ===== Mock/Placeholder Methods (Replace with Real SDK) =====

  private mockFaceEmbedding(sampleBase64: string): string {
    // Placeholder: in production, return actual 128-d or 512-d face embedding
    const hash = sampleBase64.slice(0, 64);
    return JSON.stringify({
      type: 'face',
      hash,
      vector: new Array(128).fill(0).map(() => Math.random()),
    });
  }

  private mockVoiceEmbedding(sampleBase64: string): string {
    // Placeholder: in production, return actual i-vector or x-vector
    const hash = sampleBase64.slice(0, 64);
    return JSON.stringify({
      type: 'voice',
      hash,
      vector: new Array(256).fill(0).map(() => Math.random()),
    });
  }

  private mockVerification(
    type: BiometricType,
    sampleBase64: string,
    enrollments: BiometricEnrollment[],
  ): {
    matchScore: number;
    livenessScore: number;
    spoofScore: number;
    qualityScore: number;
    matchedEnrollmentId?: string;
  } {
    // Placeholder: simulate realistic scores for development
    // In production, this calls the actual biometric verification SDK

    // For development: generate scores that usually pass
    const matchScore = 80 + Math.floor(Math.random() * 15); // 80-95
    const livenessScore = 75 + Math.floor(Math.random() * 20); // 75-95
    const spoofScore = Math.floor(Math.random() * 20); // 0-20
    const qualityScore = 70 + Math.floor(Math.random() * 25); // 70-95

    return {
      matchScore,
      livenessScore,
      spoofScore,
      qualityScore,
      matchedEnrollmentId: enrollments[0]?.id,
    };
  }
}
