import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { LedgerTransactionType } from '../common/enums';

@Entity('ledger_transactions')
export class LedgerTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: LedgerTransactionType })
  type: LedgerTransactionType;

  @Column({ type: 'varchar', length: 120 })
  reference: string;

  @Column({ type: 'varchar', length: 20, default: 'posted' })
  status: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
