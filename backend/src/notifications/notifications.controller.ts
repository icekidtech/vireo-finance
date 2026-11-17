import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsUUID } from 'class-validator';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Notification } from './notification.entity';

class MarkReadDto {
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
  ) {
    const take = Math.min(Math.max(Number.parseInt(limit ?? '20', 10) || 20, 1), 50);
    const items = await this.notifications.find({
      where: { userId: user.userId, ...(unread === 'true' ? { readAt: IsNull() } : {}) },
      order: { createdAt: 'DESC' },
      take,
    });
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
    await this.notifications.update(
      {
        userId: user.userId,
        readAt: IsNull(),
        ...(dto.ids ? { id: In(dto.ids) } : {}),
      },
      { readAt: new Date() },
    );
  }
}
