import { IWorkItemState } from '../../common/interfaces/state.interface';
import { WorkItemStatus } from '../../common/enums/work-item-status.enum';
import { OpenState } from '../states/open.state';
import { InvestigatingState } from '../states/investigating.state';
import { ResolvedState } from '../states/resolved.state';
import { ClosedState } from '../states/closed.state';

/**
 * Context wrapping the current state of a WorkItem.
 * Delegates all transition logic to the current state object.
 */
export class WorkItemContext {
  private state: IWorkItemState;

  constructor(currentStatus: WorkItemStatus) {
    this.state = WorkItemContext.resolveState(currentStatus);
  }

  static resolveState(status: WorkItemStatus): IWorkItemState {
    switch (status) {
      case WorkItemStatus.OPEN:
        return new OpenState();
      case WorkItemStatus.INVESTIGATING:
        return new InvestigatingState();
      case WorkItemStatus.RESOLVED:
        return new ResolvedState();
      case WorkItemStatus.CLOSED:
        return new ClosedState();
      default:
        throw new Error(`Unknown WorkItem status: ${status}`);
    }
  }

  /**
   * Attempt to transition to targetStatus.
   * Returns the new status if allowed; throws otherwise.
   */
  transition(targetStatus: WorkItemStatus): WorkItemStatus {
    const newStatus = this.state.transition(targetStatus);
    this.state = WorkItemContext.resolveState(newStatus);
    return newStatus;
  }

  getCurrentStatus(): WorkItemStatus {
    return this.state.getStatus();
  }
}
