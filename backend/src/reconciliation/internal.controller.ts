import { Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';

@Controller('internal')
export class InternalController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post('reconciliation/run')
  run(@Headers('x-internal-token') token: string | undefined) {
    const expected = process.env.INTERNAL_API_TOKEN ?? '';
    if (!expected || token !== expected) {
      throw new UnauthorizedException('Invalid internal token');
    }
    return this.reconciliation.run();
  }
}
