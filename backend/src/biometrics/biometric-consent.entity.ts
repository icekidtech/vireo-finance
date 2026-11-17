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

export enum ConsentStatus {
  GRANTED = 'granted',
  REVOKED = 'revoked',
}

export enum ConsentPurpose {
  ENROLLMENT = 'enrollment',
  VERIFICATION = 'verification',
  BOTH = 'both',
}

/**
 * Explicit, auditable consent record for biometric data collection.
 * Required before any face or voice data can be captured or stored.
 */
@Entity('biometric_consents')
@Index(['userId', 'status'])
export class BiometricConsent {
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
    enum: ConsentStatus,
    default: ConsentStatus.GRANTED,
  })
  status: ConsentStatus;

  @Column({
    type: 'enum',
    enum: ConsentPurpose,
    default: ConsentPurpose.BOTH,
  })
  purpose: ConsentPurpose;

  /**
   * The consent text or version that the user agreed to.
   */
  @Column({ type: 'text' })
  consentText: string;

  /**
   * Version identifier for the consent terms (for auditing changes).
   */
  @Column({ type: 'varchar', length: 50 })
  consentVersion: string;

  /**
   * IP address and user agent at consent time for audit purposes.
   */
  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    deviceId?: string;
    location?: string;
  } | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  revokedReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
