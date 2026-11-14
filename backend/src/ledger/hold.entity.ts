import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { HoldStatus } from '../common/enums';

@Entity('holds')
@Index(['accountId', 'status'])
export class Hold {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @Column({ type: 'bigint' })
  amount: string;

  @Index()
  @Column({ type: 'varchar', length: 120 })
  reference: string;

  @Column({ type: 'enum', enum: HoldStatus, default: HoldStatus.ACTIVE })
  status: HoldStatus;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
