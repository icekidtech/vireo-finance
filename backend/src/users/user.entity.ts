import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole, UserStatus } from '../common/enums';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  phone: string;

  @Index({ unique: true, where: '"handle" IS NOT NULL' })
  @Column({ type: 'varchar', length: 32, nullable: true })
  handle: string | null;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'smallint', default: 0 })
  kycTier: number;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ type: 'varchar', length: 20, default: UserRole.USER })
  role: UserRole;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
