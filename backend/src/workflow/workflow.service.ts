import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { WorkItemStatus } from '../common/enums/work-item-status.enum';
import { WorkItemContext } from './context/work-item.context';
import { DebounceService } from '../debounce/debounce.service';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  // Injected lazily to avoid circular deps — set by GatewayModule
  private gatewayBroadcast?: (event: string, data: unknown) => void;

  constructor(
    private readonly prisma: PrismaService,
    private readonly debounce: DebounceService,
  ) {}

  /** Called by GatewayModule to wire up broadcast without circular DI */
  registerGateway(fn: (event: string, data: unknown) => void): void {
    this.gatewayBroadcast = fn;
  }

  /**
   * Transition a WorkItem to a new status.
   * Enforces the state machine via WorkItemContext.
   * Requires a valid RCA if transitioning to CLOSED.
   */
  async transition(workItemId: string, targetStatus: WorkItemStatus): Promise<{ id: string; status: WorkItemStatus }> {
    const workItem = await this.prisma.workItem.findUnique({
      where: { id: workItemId },
      include: { rca: true },
    });

    if (!workItem) {
      throw new NotFoundException(`WorkItem ${workItemId} not found`);
    }

    // Gate: RCA required before CLOSED
    if (targetStatus === WorkItemStatus.CLOSED && !workItem.rca) {
      throw new BadRequestException(
        `Cannot transition to CLOSED: WorkItem ${workItemId} has no associated RCA.`,
      );
    }

    const context = new WorkItemContext(workItem.status as WorkItemStatus);
    const newStatus = context.transition(targetStatus);

    const updated = await this.prisma.$transaction(async (tx) => {
      return tx.workItem.update({
        where: { id: workItemId },
        data: { status: newStatus },
      });
    });

    this.logger.log(
      `WorkItem ${workItemId}: ${workItem.status} → ${newStatus}`,
    );

    // Evict from active cache if CLOSED
    if (newStatus === WorkItemStatus.CLOSED) {
      await this.debounce.evictIncidentCache(workItemId);
    }

    this.gatewayBroadcast?.('incident.status_changed', {
      id: updated.id,
      status: updated.status,
      componentId: updated.componentId,
      severity: updated.severity,
    });

    return { id: updated.id, status: updated.status as WorkItemStatus };
  }
}
