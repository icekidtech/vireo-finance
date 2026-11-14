import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MerchantService } from './merchant.service';

@UseGuards(JwtAuthGuard)
@Controller('merchant-orders')
export class MerchantOrderController {
  constructor(private readonly merchants: MerchantService) {}

  @Get(':reference')
  get(@Param('reference') reference: string) {
    return this.merchants.getOrder(reference);
  }
}
