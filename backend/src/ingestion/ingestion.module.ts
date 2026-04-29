import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [QueueModule],
  controllers: [IngestionController],
})
export class IngestionModule {}
