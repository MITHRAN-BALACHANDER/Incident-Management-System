import { Module } from '@nestjs/common';
import { DebounceService } from './debounce.service';

@Module({
  providers: [DebounceService],
  exports: [DebounceService],
})
export class DebounceModule {}
