import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TransferStatus, TransferType } from '../common/enums';

@Entity('transfers')
export class Transfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: TransferType })
  type: TransferType;

  @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.DRAFT })
  status: TransferStatus;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  sourceAccountId: string | null;

  @Column({ type: 'uuid', nullable: true })
  destinationAccountId: string | null;

  @Column({ type: 'uuid', nullable: true })
  challengeId: string | null;

  @Column({ type: 'uuid', nullable: true })
  initiatedByUserId: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  recipientPhone: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  recipientBankCode: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  recipientAccountNumber: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  recipientName: string | null;

  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'bigint', default: 0 })
  fee: string;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Index()
  @Column({ type: 'varchar', length: 120, nullable: true })
  pagaReference: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  failureReason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
