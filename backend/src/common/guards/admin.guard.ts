import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../enums';
import { User } from '../../users/user.entity';

/**
 * Staff-only guard. Must run AFTER JwtAuthGuard, which populates request.user.
 * The role is checked against the database (not the JWT) so revocation takes
 * effect immediately.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Admin access required');
    }
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
    return true;
  }
}