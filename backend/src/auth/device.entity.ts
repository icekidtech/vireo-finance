import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DevicePlatform, DeviceStatus, SignatureAlgorithm } from '../common/enums';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  /** Base64-encoded SPKI DER public key generated in the device secure hardware. */
  @Column({ type: 'text' })
  publicKey: string;

  @Column({ type: 'enum', enum: DevicePlatform })
  platform: DevicePlatform;

  @Column({ type: 'enum', enum: SignatureAlgorithm, default: SignatureAlgorithm.ED25519 })
  algorithm: SignatureAlgorithm;

  @Column({ type: 'varchar', length: 32, default: 'unknown' })
  attestationState: string;

  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.ACTIVE })
  status: DeviceStatus;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
