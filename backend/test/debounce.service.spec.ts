import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DebounceService } from '../src/debounce/debounce.service';
import { Severity } from '../src/common/enums/severity.enum';

// Mock ioredis
jest.mock('ioredis', () => {
  const pipelineResult = [
    [null, 1], // RPUSH returned 1 (first item)
    [null, 1], // EXPIRE returned 1
  ];

  const mockPipeline = {
    rpush: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    lrange: jest.fn().mockReturnThis(),
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(pipelineResult),
  };

  const mockRedis = {
    pipeline: jest.fn().mockReturnValue(mockPipeline),
    exists: jest.fn().mockResolvedValue(0),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue('OK'),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
  };

  return jest.fn().mockImplementation(() => mockRedis);
});

describe('DebounceService — Sliding Window Engine', () => {
  let service: DebounceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DebounceService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: unknown) => def),
          },
        },
      ],
    }).compile();

    service = module.get<DebounceService>(DebounceService);
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should return isNew=true for the first signal in a window', async () => {
    const Redis = require('ioredis');
    const redisInstance = new Redis();
    const pipeline = redisInstance.pipeline();
    pipeline.exec.mockResolvedValueOnce([
      [null, 1], // list length 1 → first signal
      [null, 1],
    ]);

    const result = await service.addSignal('svc-auth', 'signal-001', Severity.P1);
    expect(result.isNew).toBe(true);
    expect(result.ttlSeconds).toBe(10); // P1 = 10s
  });

  it('should return isNew=false for subsequent signals in same window', async () => {
    const Redis = require('ioredis');
    const redisInstance = new Redis();
    const pipeline = redisInstance.pipeline();
    pipeline.exec.mockResolvedValueOnce([
      [null, 3], // list length 3 → not first
      [null, 1],
    ]);

    const result = await service.addSignal('svc-auth', 'signal-003', Severity.P1);
    expect(result.isNew).toBe(false);
  });

  it('should use correct TTL for P0 severity (5 seconds)', async () => {
    const result = await service.addSignal('svc-auth', 'signal-p0', Severity.P0);
    expect(result.ttlSeconds).toBe(5);
  });

  it('should use correct TTL for P2 severity (30 seconds)', async () => {
    const Redis = require('ioredis');
    const redisInstance = new Redis();
    const pipeline = redisInstance.pipeline();
    pipeline.exec.mockResolvedValueOnce([
      [null, 1],
      [null, 1],
    ]);

    const result = await service.addSignal('svc-db', 'signal-p2', Severity.P2);
    expect(result.ttlSeconds).toBe(30);
  });

  it('should return all signal IDs on flushWindow', async () => {
    const Redis = require('ioredis');
    const redisInstance = new Redis();
    const pipeline = redisInstance.pipeline();
    pipeline.exec.mockResolvedValueOnce([
      [null, ['signal-001', 'signal-002', 'signal-003']], // LRANGE
      [null, 1], // DEL
    ]);

    const ids = await service.flushWindow('svc-auth');
    expect(ids).toEqual(['signal-001', 'signal-002', 'signal-003']);
  });

  it('should return empty array if window already expired on flush', async () => {
    const Redis = require('ioredis');
    const redisInstance = new Redis();
    const pipeline = redisInstance.pipeline();
    pipeline.exec.mockResolvedValueOnce([
      [null, []], // LRANGE returns empty (key expired)
      [null, 0],
    ]);

    const ids = await service.flushWindow('svc-auth');
    expect(ids).toEqual([]);
  });

  it('should confirm health check passes when Redis is reachable', async () => {
    const ok = await service.healthCheck();
    expect(ok).toBe(true);
  });
});
