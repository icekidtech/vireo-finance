import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { DevelopersService } from './developers.service';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';

@Controller('developers')
export class DevelopersController {
  constructor(private readonly developers: DevelopersService) {}

  @Post('waitlist')
  @HttpCode(HttpStatus.CREATED)
  async joinWaitlist(@Body() dto: JoinWaitlistDto) {
    await this.developers.joinWaitlist(dto);
    return { success: true, message: 'Successfully joined the waitlist' };
  }
}
