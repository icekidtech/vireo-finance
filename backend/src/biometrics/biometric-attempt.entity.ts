import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { BiometricType } from './biometric-enrollment.entity';

export enum AttemptResult {
  APPROVED = 'approved',
  DENIED = 'denied',
  STEP_UP = 'step_up',
  ERROR = 'error',
}

export enum AttemptContext {
  ENROLLMENT = 'enrollment',
  PAYMENT = 'payment',
  VERIFICATION = 'verification',
}

/**
 * Audit log for every biometric verification attempt.
 * Critical for fraud investigation, debugging, and compliance.
 */
@Entity('biometric_attempts')
@Index(['userId', 'createdAt'])
@Index(['result', 'createdAt'])
@Index(['context', 'createdAt'])
export class BiometricAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({
    type: 'enum',
    enum: BiometricType,
  })
  type: BiometricType;

  @Column({
    type: 'enum',
    enum: AttemptResult,
  })
  result: AttemptResult;

  @Column({
    type: 'enum',
    enum: AttemptContext,
  })
  context: AttemptContext;

  /**
   * Match score (0-100, higher means better match).
   */
  @Column({ type: 'int', nullable: true })
  matchScore: number | null;

  /**
   * Liveness score (0-100, higher means more confident it's a live person).
   */
  @Column({ type: 'int', nullable: true })
  livenessScore: number | null;

  /**
   * Spoof/presentation attack detection score (0-100, higher means more likely fake).
   */
  @Column({ type: 'int', nullable: true })
  spoofScore: number | null;

  /**
   * Overall quality score of the captured biometric sample.
   */
  @Column({ type: 'int', nullable: true })
  qualityScore: number | null;

  /**
   * The enrollment ID that was matched (if successful).
   */
  @Column({ type: 'uuid', nullable: true })
  matchedEnrollmentId: string | null;

  /**
   * Reference to the related transfer or transaction (if this was for a payment).
   */
  @Column({ type: 'uuid', nullable: true })
  transferId: string | null;

  /**
   * Merchant ID if this was a terminal payment attempt.
   */
  @Column({ type: 'uuid', nullable: true })
  merchantId: string | null;

  /**
   * Additional context: device info, location, error messages, etc.
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
