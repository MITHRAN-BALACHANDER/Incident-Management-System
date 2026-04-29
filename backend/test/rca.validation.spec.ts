import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WorkflowService } from '../src/workflow/workflow.service';
import { PrismaService } from '../src/database/prisma/prisma.service';
import { DebounceService } from '../src/debounce/debounce.service';
import { WorkItemStatus } from '../src/common/enums/work-item-status.enum';
import { Severity } from '../src/common/enums/severity.enum';

const mockWorkItem = (overrides: Partial<{
  id: string;
  status: WorkItemStatus;
  rca: object | null;
}> = {}) => ({
  id: 'work-item-uuid-001',
  componentId: 'svc-auth',
  severity: Severity.P0,
  status: WorkItemStatus.RESOLVED,
  createdAt: new Date(),
  updatedAt: new Date(),
  rca: null,
  ...overrides,
});

describe('RCA Validation — Transition to CLOSED', () => {
  let service: WorkflowService;
  let prisma: jest.Mocked<PrismaService>;
  let debounce: jest.Mocked<DebounceService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowService,
        {
          provide: PrismaService,
          useValue: {
            workItem: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            $transaction: jest.fn((fn) =>
              fn({
                workItem: { update: jest.fn().mockResolvedValue(mockWorkItem({ status: WorkItemStatus.CLOSED })) },
              }),
            ),
          },
        },
        {
          provide: DebounceService,
          useValue: {
            evictIncidentCache: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<WorkflowService>(WorkflowService);
    prisma = module.get(PrismaService);
    debounce = module.get(DebounceService);
  });

  it('should throw BadRequestException when transitioning to CLOSED without an RCA', async () => {
    prisma.workItem.findUnique = jest.fn().mockResolvedValue(
      mockWorkItem({ status: WorkItemStatus.RESOLVED, rca: null }),
    );

    await expect(
      service.transition('work-item-uuid-001', WorkItemStatus.CLOSED),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.transition('work-item-uuid-001', WorkItemStatus.CLOSED),
    ).rejects.toThrow(/Cannot transition to CLOSED/);
  });

  it('should successfully transition to CLOSED when a valid RCA exists', async () => {
    const rcaStub = { id: 'rca-001', workItemId: 'work-item-uuid-001', mttr: 5000 };

    prisma.workItem.findUnique = jest.fn().mockResolvedValue(
      mockWorkItem({ status: WorkItemStatus.RESOLVED, rca: rcaStub }),
    );

    const result = await service.transition('work-item-uuid-001', WorkItemStatus.CLOSED);

    expect(result.status).toBe(WorkItemStatus.CLOSED);
    expect(debounce.evictIncidentCache).toHaveBeenCalledWith('work-item-uuid-001');
  });

  it('should throw NotFoundException when the WorkItem does not exist', async () => {
    prisma.workItem.findUnique = jest.fn().mockResolvedValue(null);

    await expect(
      service.transition('non-existent-id', WorkItemStatus.CLOSED),
    ).rejects.toThrow(NotFoundException);
  });
});
