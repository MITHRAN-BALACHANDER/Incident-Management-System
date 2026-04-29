import { Module } from '@nestjs/common';
import { RcaController } from './rca.controller';
import { RcaService } from './rca.service';

@Module({
  controllers: [RcaController],
  providers: [RcaService],
  exports: [RcaService],
})
export class RcaModule {}
