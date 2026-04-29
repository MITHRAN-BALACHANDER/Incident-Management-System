import { BadRequestException } from '@nestjs/common';
import { IWorkItemState } from '../../common/interfaces/state.interface';
import { WorkItemStatus } from '../../common/enums/work-item-status.enum';

export class ResolvedState implements IWorkItemState {
  getStatus(): WorkItemStatus {
    return WorkItemStatus.RESOLVED;
  }

  /**
   * Transition to CLOSED is allowed here but the WorkflowService
   * MUST validate that a valid RCA exists before calling this.
   */
  transition(targetStatus: WorkItemStatus): WorkItemStatus {
    if (targetStatus === WorkItemStatus.CLOSED) {
      return WorkItemStatus.CLOSED;
    }
    throw new BadRequestException(
      `Invalid transition: RESOLVED → ${targetStatus}. Only RESOLVED → CLOSED is allowed (requires RCA).`,
    );
  }
}
