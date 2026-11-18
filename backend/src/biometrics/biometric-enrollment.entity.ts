import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum BiometricType {
  FACE = 'face',
  VOICE = 'voice',
}

export enum BiometricStatus {
  ACTIVE = 'active',
  REVOKED = 'revoked',
  EXPIRED = 'expired',
}

@Entity('biometric_enrollments')
@Index(['userId', 'type', 'status'])
@Index(['userId', 'status'])
export class BiometricEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: BiometricType,
  })
  type: BiometricType;

  @Column({
    type: 'enum',
    enum: BiometricStatus,
    default: BiometricStatus.ACTIVE,
  })
  status: BiometricStatus;

  /**
   * Encrypted biometric embedding (face vector or voice embedding).
   * Never store raw biometric images or audio.
   */
  @Column({ type: 'text' })
  embeddingEncrypted: string;

  /**
   * Metadata about the enrollment: device info, capture quality scores, etc.
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  /**
   * Reference to the consent record that authorized this enrollment.
   */
  @Column({ type: 'uuid' })
  consentId: string;

  /**
   * Version of the biometric model used (for future model upgrades).
   */
  @Column({ type: 'varchar', length: 50, default: 'v1' })
  modelVersion: string;

  /**
   * Quality score at enrollment time (0-100, higher is better).
   */
  @Column({ type: 'int', nullable: true })
  qualityScore: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
