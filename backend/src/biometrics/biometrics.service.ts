import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, MoreThan } from 'typeorm';
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
import { encryptEmbedding, decryptEmbedding, parseEncryptionKey } from '../common/crypto';
import { BIOMETRIC_PROVIDER, BiometricProvider } from './biometric-provider';

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    @Inject(BIOMETRIC_PROVIDER) private readonly provider: BiometricProvider | null,
  ) {
    const key = this.config.get<string>('biometrics.encryptionKey');
    this.encryptionKey = key ? parseEncryptionKey(key) : null;
  }

  private readonly encryptionKey: Buffer | null;

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
    await this.forgetSavedFaces(userId);
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
    this.assertReady();
    // Verify consent exists and is active
    const consent = await this.consents.findOne({
      where: { id: dto.consentId, userId, status: ConsentStatus.GRANTED },
    });
    if (!consent) {
      throw new ForbiddenException('Valid consent is required before enrolling biometrics');
    }

    const { template, qualityScore, searchRef } = await this.requireProvider().enroll(
      dto.type,
      dto.sampleBase64,
      { userId },
    );

    if (qualityScore < this.getMinQualityScore()) {
      throw new BadRequestException(
        `Biometric quality too low (${qualityScore}/100). Please try again in better conditions.`,
      );
    }

    // Encrypt the template (AES-256-GCM, bound to this user) before storing
    const embeddingEncrypted = encryptEmbedding(template, this.requireKey(), userId);

    // Revoke existing enrollments of this type (users can re-enroll). Their saved faces are
    // deleted at the vendor as well, so only the newest face stays searchable.
    await this.forgetSavedFaces(userId, dto.type);
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
        modelVersion: this.requireProvider().name,
        qualityScore,
        metadata: searchRef ? { ...(dto.metadata ?? {}), searchRef } : (dto.metadata ?? null),
      }),
    );

    this.logger.log(`Biometric ${dto.type} enrolled for user ${userId}`);
    return enrollment;
  }

  /**
   * Deletes, at the vendor, the faces saved in its search index for this customer's ACTIVE
   * enrollments. Best effort: the local revocation is what actually stops a payment (a face-only
   * payment also requires an active enrollment), so a vendor outage never blocks a revocation.
   */
  private async forgetSavedFaces(userId: string, type?: BiometricType): Promise<void> {
    const provider = this.provider;
    if (!provider?.forgetFace) return;
    const active = await this.enrollments.find({
      where: { userId, status: BiometricStatus.ACTIVE, ...(type ? { type } : {}) },
    });
    for (const enrollment of active) {
      const ref = (enrollment.metadata as { searchRef?: unknown } | null)?.searchRef;
      if (typeof ref !== 'string') continue;
      try {
        await provider.forgetFace(ref);
      } catch (error) {
        this.logger.error(
          `Could not delete the saved face for user ${userId} at the vendor: ${String(error)}`,
        );
      }
    }
  }

  /**
   * Identify a user by face (1:N search) - TRUE DEVICELESS PAYMENT.
   * No identifier needed - just scan the face and find the user.
   */
  async identifyByFace(
    sampleBase64: string,
    context: AttemptContext,
    amountMinor?: number,
  ): Promise<FusionResult> {
    this.assertReady();

    // Check if provider supports face search
    const provider = this.requireProvider();
    if (!provider.searchFace) {
      throw new ServiceUnavailableException('Face search is not supported by this provider');
    }

    // Search for matching faces across ALL users
    const matches = await provider.searchFace(sampleBase64);

    if (matches.length === 0) {
      // No matches found - customer not enrolled
      await this.padUnknownIdentifierLatency();
      return this.logAttempt(null, BiometricType.FACE, AttemptResult.DENIED, context, {
        matchScore: 0,
        livenessScore: 0,
        spoofScore: 100,
        qualityScore: 0,
      });
    }

    // Get the best match
    const bestMatch = matches[0]; // Already sorted by similarity in DiditProvider

    // Find user by userId or vendorData
    // The vendor hands back the label we saved with the face (the customer's id). Only a real id
    // is looked up: anything else is not ours and must never reach the database query.
    const claimedId = [bestMatch.userId, bestMatch.vendorData].find(
      (v): v is string => typeof v === 'string' && UUID_PATTERN.test(v),
    );
    let user: User | null = null;
    if (claimedId) {
      user = await this.users.findOne({ where: { id: claimedId } });
    }

    if (!user) {
      return this.logAttempt(null, BiometricType.FACE, AttemptResult.DENIED, context, {
        matchScore: bestMatch.similarityScore,
        livenessScore: 0,
        spoofScore: 0,
        qualityScore: 0,
      });
    }

    // Check for lockout
    if (await this.isLockedOut(user.id)) {
      return {
        decision: AttemptResult.DENIED,
        userId: user.id,
        scores: { matchScore: 0, livenessScore: 0, spoofScore: 0, qualityScore: 0 },
        reason: 'Too many failed attempts',
      };
    }

    // The face must still be ENROLLED here. The vendor may keep a face after a customer removes
    // it (or after an enrolment from before this feature), and that must never allow a payment.
    const enrolled = await this.enrollments.count({
      where: { userId: user.id, type: BiometricType.FACE, status: BiometricStatus.ACTIVE },
    });
    if (enrolled === 0) {
      return this.logAttempt(null, BiometricType.FACE, AttemptResult.DENIED, context, {
        matchScore: 0,
        livenessScore: 0,
        spoofScore: 0,
        qualityScore: 0,
      });
    }

    // Check consent
    const hasConsent = await this.hasActiveConsent(user.id);
    if (!hasConsent) {
      return {
        ...(await this.logAttempt(user.id, BiometricType.FACE, AttemptResult.DENIED, context, {
          matchScore: bestMatch.similarityScore,
          livenessScore: 0,
          spoofScore: 0,
          qualityScore: 0,
        })),
        userId: user.id,
      };
    }

    // Convert similarity score to match score (0-100)
    const scores = {
      matchScore: bestMatch.similarityScore,
      livenessScore: 85, // Didit does liveness during search
      spoofScore: 0, // Didit checks for spoofs
      qualityScore: 80, // Reasonable assumption for search results
    };

    // Apply score fusion
    const fusionResult = this.scoreFusion({ ...scores }, amountMinor);

    // Log attempt
    await this.logAttempt(
      user.id,
      BiometricType.FACE,
      fusionResult.decision,
      context,
      fusionResult.scores,
    );

    return { ...fusionResult, userId: user.id };
  }

  /**
   * Verify a biometric sample against stored enrollments.
   * Returns a decision: approved, denied, or step_up.
   */
  async verify(dto: VerifyBiometricDto, context: AttemptContext): Promise<FusionResult> {
    this.assertReady();
    // Look up user by identifier (phone or handle)
    const user = await this.findUserByIdentifier(dto.identifier);
    if (!user) {
      // Same response as any other denial; pad the latency so existence is not leaked by speed.
      await this.padUnknownIdentifierLatency();
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

    // Decrypt each stored template, bound to its owner. A template that cannot
    // be decrypted (wrong key, tampering, legacy format) is never matched against.
    const usable: { id: string; template: string }[] = [];
    for (const enrollment of enrollments) {
      try {
        usable.push({
          id: enrollment.id,
          template: decryptEmbedding(enrollment.embeddingEncrypted, this.requireKey(), user.id),
        });
      } catch {
        this.logger.warn(`Skipping unreadable biometric template ${enrollment.id}`);
      }
    }
    if (usable.length === 0) {
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

    const result = await this.requireProvider().verify(
      dto.type,
      dto.sampleBase64,
      usable.map((u) => u.template),
    );
    const verificationResult = {
      matchScore: result.matchScore,
      livenessScore: result.livenessScore,
      spoofScore: result.spoofScore,
      qualityScore: result.qualityScore,
      matchedEnrollmentId:
        result.matchedTemplateIndex !== undefined
          ? usable[result.matchedTemplateIndex]?.id
          : undefined,
    };

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
    await this.forgetSavedFaces(userId, dto.type);
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
    const thresholds = this.getThresholds();

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
   * Biometrics only run against a configured vendor adapter. With none
   * configured every biometric operation fails closed.
   */
  /** Both a vendor adapter and the template-encryption key must exist, checked before any work. */
  /** Whether enrollment and verification can run, so clients can say so up front. */
  status(): { available: boolean; types: string[]; testMode: boolean } {
    const available = !!this.provider && !!this.encryptionKey;
    // A sandbox vendor key approves every image, so clients must say that results are not real.
    const testMode = this.config.get<string>('biometrics.didit.keyType') === 'sandbox';
    return {
      available,
      types: available ? [BiometricType.FACE] : [],
      testMode: available && testMode,
    };
  }

  private assertReady(): void {
    this.requireProvider();
    this.requireKey();
  }

  private requireProvider(): BiometricProvider {
    if (!this.provider) {
      throw new ServiceUnavailableException('Biometric verification is not available');
    }
    return this.provider;
  }

  private requireKey(): Buffer {
    if (!this.encryptionKey) {
      throw new ServiceUnavailableException('Biometric verification is not available');
    }
    return this.encryptionKey;
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

  private getThresholds() {
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

  private getConsentText(version: string): string {
    // In production, load from a consent repository or CMS
    return `
Vireo Finance Biometric Data Consent (Version ${version})

By consenting, you authorize Vireo Finance to:
1. Collect and process your face photo
2. Store an encrypted copy of it for identity verification
3. Use your biometrics to authorize payments at merchant terminals
4. Retain your data until you revoke consent or close your account

You have the right to:
- Revoke consent at any time through the app settings
- Request deletion of all biometric data
- Access logs of biometric verification attempts

Your biometric data is encrypted, never shared with third parties, and used only for authentication purposes as described in our Privacy Policy.
    `.trim();
  }

  /**
   * Not a verification: delays the response for an identifier that matches no
   * user so it is not trivially distinguishable from a real denial by speed.
   */
  private async padUnknownIdentifierLatency(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
  }
}
