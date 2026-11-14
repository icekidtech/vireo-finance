import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('virtual_accounts')
export class VirtualAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  accountNumber: string;

  @Column({ type: 'varchar', length: 80 })
  bankName: string;

  @Column({ type: 'varchar', length: 120 })
  providerReference: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
