import { BadRequestException } from '@nestjs/common';
import { IWorkItemState } from '../../common/interfaces/state.interface';
import { WorkItemStatus } from '../../common/enums/work-item-status.enum';

export class ClosedState implements IWorkItemState {
  getStatus(): WorkItemStatus {
    return WorkItemStatus.CLOSED;
  }

  transition(_targetStatus: WorkItemStatus): WorkItemStatus {
    throw new BadRequestException(
      'CLOSED is a terminal state. No further transitions are allowed.',
    );
  }
}
