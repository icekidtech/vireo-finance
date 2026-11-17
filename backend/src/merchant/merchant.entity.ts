import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('merchants')
export class Merchant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 60 })
  handle: string;

  @Column({ type: 'varchar', length: 160 })
  businessName: string;

  @Column({ type: 'varchar', length: 40, default: 'pending' })
  kybStatus: string;

  /** CAC registration number (RC / BN / IT) submitted for level 2. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  cacNumber: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  tin: string | null;

  /** The uploaded CAC certificate (a document id), for staff review. */
  @Column({ type: 'uuid', nullable: true })
  cacDocumentId: string | null;

  /** none -> pending (submitted) -> verified | rejected, decided by a reviewer. */
  @Column({ type: 'varchar', length: 20, default: 'none' })
  registrationStatus: string;

  @Column({ type: 'uuid', nullable: true })
  settlementAccountId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  settlementBankCode: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  settlementAccountNumber: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  settlementAccountName: string | null;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
