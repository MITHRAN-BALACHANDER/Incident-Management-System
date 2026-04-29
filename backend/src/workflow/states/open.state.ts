import { BadRequestException } from '@nestjs/common';
import { IWorkItemState } from '../../common/interfaces/state.interface';
import { WorkItemStatus } from '../../common/enums/work-item-status.enum';

export class OpenState implements IWorkItemState {
  getStatus(): WorkItemStatus {
    return WorkItemStatus.OPEN;
  }

  transition(targetStatus: WorkItemStatus): WorkItemStatus {
    if (targetStatus === WorkItemStatus.INVESTIGATING) {
      return WorkItemStatus.INVESTIGATING;
    }
    throw new BadRequestException(
      `Invalid transition: OPEN → ${targetStatus}. Only OPEN → INVESTIGATING is allowed.`,
    );
  }
}
