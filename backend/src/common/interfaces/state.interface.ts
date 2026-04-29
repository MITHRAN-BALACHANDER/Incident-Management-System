import { WorkItemStatus } from '../enums/work-item-status.enum';

export interface IWorkItemState {
  /**
   * Attempt a transition to the target status.
   * Throws if the transition is illegal.
   */
  transition(targetStatus: WorkItemStatus): WorkItemStatus;

  /**
   * The status this state represents.
   */
  getStatus(): WorkItemStatus;
}
