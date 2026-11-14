import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AgentToolCallStatus } from '../common/enums';

@Entity('agent_tool_calls')
export class AgentToolCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  sessionId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 60 })
  toolName: string;

  @Column({ type: 'jsonb' })
  input: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  output: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: AgentToolCallStatus })
  status: AgentToolCallStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  error: string | null;

  @Column({ type: 'uuid', nullable: true })
  draftTransferId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
