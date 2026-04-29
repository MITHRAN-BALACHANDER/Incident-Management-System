import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DebounceModule } from '../debounce/debounce.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [DebounceModule, QueueModule],
  controllers: [HealthController],
})
export class HealthModule {}
