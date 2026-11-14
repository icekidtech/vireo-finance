import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { PagaEventStatus } from '../common/enums';

@Entity('paga_events')
export class PagaEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  providerEventId: string;

  @Column({ type: 'varchar', length: 80 })
  type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  signature: string | null;

  @Column({ type: 'enum', enum: PagaEventStatus, default: PagaEventStatus.RECEIVED })
  status: PagaEventStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  error: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
