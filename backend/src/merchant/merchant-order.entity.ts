import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { MerchantOrderStatus } from '../common/enums';

@Entity('merchant_orders')
export class MerchantOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  merchantId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 60 })
  reference: string;

  @Column({ type: 'bigint' })
  amount: string;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'enum', enum: MerchantOrderStatus, default: MerchantOrderStatus.OPEN })
  status: MerchantOrderStatus;

  @Column({ type: 'uuid', nullable: true })
  paidByUserId: string | null;

  @Column({ type: 'uuid', nullable: true })
  transferId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
