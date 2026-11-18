import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsModule } from '../accounts/accounts.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PagaModule } from '../paga/paga.module';
import { TransfersModule } from '../transfers/transfers.module';
import { User } from '../users/user.entity';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentSession } from './agent-session.entity';
import { AgentToolCall } from './agent-tool-call.entity';
import { LlmService } from './llm/llm.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentSession, AgentToolCall, User]),
    AccountsModule,
    LedgerModule,
    TransfersModule,
    PagaModule,
  ],
  controllers: [AgentController],
  providers: [AgentService, LlmService],
  exports: [AgentService],
})
export class AgentModule {}
