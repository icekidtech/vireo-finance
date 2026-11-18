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

  /** Keyed hash of the NIN (one NIN per account); null until tier 2. */
  @Index({ unique: true, where: '"ninHash" IS NOT NULL' })
  @Column({ type: 'varchar', length: 64, nullable: true })
  ninHash: string | null;

  @Column({ type: 'text', nullable: true })
  ninEncrypted: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  ninLast4: string | null;

  /** The home address proved at tier 3, encrypted. */
  @Column({ type: 'text', nullable: true })
  addressEncrypted: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  verifiedAt: Date;
}
