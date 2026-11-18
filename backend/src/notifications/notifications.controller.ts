import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Notification } from './notification.entity';

type Scope = 'personal' | 'merchant';

/**
 * One login can have both a personal wallet and a business, each with its own
 * app. A notification carries the side it belongs to (data.scope); ones without
 * a scope are treated as personal.
 */
function scopeClause(scope: Scope): string {
  return scope === 'merchant'
    ? `n."data"->>'scope' = 'merchant'`
    : `(n."data" IS NULL OR n."data"->>'scope' IS NULL OR n."data"->>'scope' = 'personal')`;
}

function parseScope(value: unknown): Scope | undefined {
  return value === 'personal' || value === 'merchant' ? value : undefined;
}

class MarkReadDto {
  /** Limit "mark all" to one side's notifications. */
  @IsOptional()
  @IsIn(['personal', 'merchant'])
  scope?: Scope;

  /** Omit to mark every unread notification as read. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  ids?: string[];
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
  ) {}

  /** The caller's own notifications, newest first. `unread=true` limits to unread. */
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('unread') unread?: string,
    @Query('limit') limit?: string,
    @Query('scope') scope?: string,
  ) {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '20', 10) || 20, 1), 50);
    const qb = this.notifications
      .createQueryBuilder('n')
      .where('n."userId" = :userId', { userId: user.userId })
      .orderBy('n."createdAt"', 'DESC')
      .take(take);
    if (unread === 'true') qb.andWhere('n."readAt" IS NULL');
    const side = parseScope(scope);
    if (side) qb.andWhere(scopeClause(side));
    const items = await qb.getMany();
    return items.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.readAt !== null,
      createdAt: n.createdAt,
    }));
  }

  @Post('read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthenticatedUser, @Body() dto: MarkReadDto) {
    const qb = this.notifications
      .createQueryBuilder('n')
      .update()
      .set({ readAt: new Date() })
      .where('"userId" = :userId AND "readAt" IS NULL', { userId: user.userId });
    if (dto.ids) qb.andWhere('"id" IN (:...ids)', { ids: dto.ids.length ? dto.ids : [''] });
    if (dto.scope) qb.andWhere(scopeClause(dto.scope).replace(/n\./g, ''));
    await qb.execute();
  }
}
