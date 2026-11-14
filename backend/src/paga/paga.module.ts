import { Module } from '@nestjs/common';
import { PagaService } from './paga.service';

@Module({
  providers: [PagaService],
  exports: [PagaService],
})
export class PagaModule {}
