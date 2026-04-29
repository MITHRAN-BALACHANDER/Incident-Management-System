import { BadRequestException } from '@nestjs/common';
import { IWorkItemState } from '../../common/interfaces/state.interface';
import { WorkItemStatus } from '../../common/enums/work-item-status.enum';

export class InvestigatingState implements IWorkItemState {
  getStatus(): WorkItemStatus {
    return WorkItemStatus.INVESTIGATING;
  }

  transition(targetStatus: WorkItemStatus): WorkItemStatus {
    if (targetStatus === WorkItemStatus.RESOLVED) {
      return WorkItemStatus.RESOLVED;
    }
    throw new BadRequestException(
      `Invalid transition: INVESTIGATING → ${targetStatus}. Only INVESTIGATING → RESOLVED is allowed.`,
    );
  }
}
