import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RCA } from '@prisma/client';
import { PrismaService } from '../database/prisma/prisma.service';
import { CreateRcaDto } from './dto/create-rca.dto';

@Injectable()
export class RcaService {
  private readonly logger = new Logger(RcaService.name);

  // Set by GatewayModule to avoid circular DI
  private gatewayBroadcast?: (event: string, data: unknown) => void;

  constructor(private readonly prisma: PrismaService) {}

  registerGateway(fn: (event: string, data: unknown) => void): void {
    this.gatewayBroadcast = fn;
  }

  async create(dto: CreateRcaDto): Promise<RCA> {
    const workItem = await this.prisma.workItem.findUnique({
      where: { id: dto.workItemId },
      include: { rca: true },
    });

    if (!workItem) {
      throw new NotFoundException(`WorkItem ${dto.workItemId} not found`);
    }

    if (workItem.rca) {
      throw new ConflictException(
        `WorkItem ${dto.workItemId} already has an RCA. Use PATCH to update.`,
      );
    }

    const actualStartTime = workItem.createdAt;
    const submissionTime = new Date();

    if (submissionTime <= actualStartTime) {
      throw new BadRequestException('Submission time must be after incident start time');
    }

    // MTTR in milliseconds: exact duration from incident open to RCA submission
    const mttr = submissionTime.getTime() - actualStartTime.getTime();

    const rca = await this.prisma.$transaction(async (tx) => {
      return tx.rCA.create({
        data: {
          workItemId: dto.workItemId,
          rootCause: dto.rootCause,
          fixApplied: dto.fixApplied,
          preventionSteps: dto.preventionSteps,
          startTime,
          endTime,
          mttr,
        },
      });
    });

    this.logger.log(
      `RCA created for WorkItem ${dto.workItemId}. MTTR: ${mttr}ms`,
    );

    this.gatewayBroadcast?.('rca.created', {
      rcaId: rca.id,
      workItemId: rca.workItemId,
      mttr,
    });

    return rca;
  }

  async findByWorkItem(workItemId: string): Promise<RCA | null> {
    return this.prisma.rCA.findUnique({ where: { workItemId } });
  }
}
