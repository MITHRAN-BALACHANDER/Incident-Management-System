import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { DebounceModule } from '../debounce/debounce.module';

@Module({
  imports: [DebounceModule],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
