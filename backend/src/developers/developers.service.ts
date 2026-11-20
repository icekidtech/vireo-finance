import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeveloperWaitlist } from './developer-waitlist.entity';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DevelopersService {
  private readonly logger = new Logger(DevelopersService.name);

  constructor(
    @InjectRepository(DeveloperWaitlist)
    private readonly waitlist: Repository<DeveloperWaitlist>,
    private readonly notifications: NotificationsService,
  ) {}

  async joinWaitlist(dto: JoinWaitlistDto): Promise<DeveloperWaitlist> {
    // Check if email already exists
    const existing = await this.waitlist.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('This email is already on the waitlist');
    }

    // Create waitlist entry
    const entry = this.waitlist.create({
      email: dto.email,
      company: dto.company,
      useCase: dto.useCase || null,
      status: 'pending',
      metadata: {
        source: 'landing_page',
        userAgent: 'web',
      },
    });

    const saved = await this.waitlist.save(entry);

    // Send welcome email
    try {
      await this.notifications.sendDeveloperWaitlistEmail(saved);
      this.logger.log(`Waitlist confirmation sent to ${dto.email}`);
    } catch (error) {
      this.logger.error(`Failed to send waitlist email to ${dto.email}: ${String(error)}`);
      // Don't fail the request if email fails
    }

    this.logger.log(`New developer waitlist signup: ${dto.email} from ${dto.company}`);
    return saved;
  }

  async getWaitlist(): Promise<DeveloperWaitlist[]> {
    return this.waitlist.find({ order: { createdAt: 'DESC' } });
  }
}
