import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ChallengeStatus, ChallengeType } from '../common/enums';

@Entity('challenges')
export class Challenge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  deviceId: string;

  @Column({ type: 'enum', enum: ChallengeType })
  type: ChallengeType;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  nonce: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ type: 'enum', enum: ChallengeStatus, default: ChallengeStatus.PENDING })
  status: ChallengeStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
