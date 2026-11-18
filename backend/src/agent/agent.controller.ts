import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AgentService } from './agent.service';
import { ChatMessageDto, RunAgentToolDto } from './dto/agent.dto';

@UseGuards(JwtAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('sessions')
  createSession(@CurrentUser() user: AuthenticatedUser) {
    return this.agent.createSession(user.userId);
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.agent.listSessions(user.userId);
  }

  @Get('sessions/:id/calls')
  listToolCalls(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.agent.listToolCalls(user.userId, id);
  }

  @Post('tools')
  runTool(@CurrentUser() user: AuthenticatedUser, @Body() dto: RunAgentToolDto) {
    return this.agent.runTool(user.userId, dto);
  }

  @Post('chat')
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChatMessageDto) {
    return this.agent.chat(user.userId, dto);
  }
}
