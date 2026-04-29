import { IsEnum } from 'class-validator';
import { WorkItemStatus } from '../../common/enums/work-item-status.enum';

export class UpdateStatusDto {
  @IsEnum(WorkItemStatus, {
    message: `status must be one of: ${Object.values(WorkItemStatus).join(', ')}`,
  })
  status: WorkItemStatus;
}
