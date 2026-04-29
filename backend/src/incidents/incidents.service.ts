import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PrismaService } from '../database/prisma/prisma.service';
import { WorkflowService } from '../workflow/workflow.service';
import { WorkItemStatus } from '../common/enums/work-item-status.enum';
import { Signal, SignalDocument } from '../database/mongo/schemas/signal.schema';

const SEVERITY_ORDER = { P0: 0, P1: 1, P2: 2 };

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    @InjectModel(Signal.name) private readonly signalModel: Model<SignalDocument>,
  ) {}

  /**
   * Return all active (non-CLOSED) incidents sorted by severity (P0 first).
   */
  async findActive() {
    const items = await this.prisma.workItem.findMany({
      where: { status: { not: WorkItemStatus.CLOSED } },
      include: { rca: true },
      orderBy: { createdAt: 'desc' },
    });

    return items.sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99),
    );
  }

  /**
   * Return a single incident with work item + RCA + raw signals from MongoDB.
   * Uses Promise.all to fetch Postgres and Mongo in parallel.
   */
  async findOne(id: string) {
    const [workItem, signals] = await Promise.all([
      this.prisma.workItem.findUnique({
        where: { id },
        include: { rca: true },
      }),
      this.signalModel.find({ workItemId: id }).sort({ timestamp: -1 }).lean().exec(),
    ]);

    if (!workItem) {
      throw new NotFoundException(`Incident ${id} not found`);
    }

    return { workItem, signals };
  }

  /**
   * Delegate status update to the workflow engine.
   */
  async updateStatus(id: string, status: WorkItemStatus) {
    return this.workflow.transition(id, status);
  }

  /**
   * Analytics: Retrieve signals per minute for a specific component.
   * Utilizes MongoDB Time-Series aggregation framework.
   */
  async getSignalsPerMinute(componentId: string) {
    return this.signalModel.aggregate([
      { $match: { componentId } },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' },
            hour: { $hour: '$timestamp' },
            minute: { $minute: '$timestamp' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id': 1 } },
    ]);
  }
}
