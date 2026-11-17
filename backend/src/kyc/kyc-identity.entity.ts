import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * The identity a user proved with their BVN. The BVN itself is stored only
 * encrypted (AES-256-GCM, bound to the user id); `bvnHash` is a keyed HMAC used
 * to stop one BVN verifying several accounts, and `bvnLast4` is for display.
 */
@Entity('kyc_identities')
export class KycIdentity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  userId: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  bvnHash: string;

  @Column({ type: 'text' })
  bvnEncrypted: string;

  @Column({ type: 'varchar', length: 4 })
  bvnLast4: string;

  @Column({ type: 'varchar', length: 60 })
  firstName: string;

  @Column({ type: 'varchar', length: 60 })
  lastName: string;

  @Column({ type: 'date' })
  dateOfBirth: string;

  @CreateDateColumn({ type: 'timestamptz' })
  verifiedAt: Date;
}
