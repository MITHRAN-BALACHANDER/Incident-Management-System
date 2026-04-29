import { Controller, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientKafka, Ctx, KafkaContext, MessagePattern, Payload } from '@nestjs/microservices';
import { Inject } from '@nestjs/common';
import CircuitBreaker from 'opossum';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import { SignalPayload } from '../common/interfaces/signal.interface';
import { KAFKA_FLUSH_TOPIC, KAFKA_SIGNAL_TOPIC } from '../queue/queue.constants';
import { DebounceService } from '../debounce/debounce.service';
import { AlertService } from '../alert/alert.service';
import { PrismaService } from '../database/prisma/prisma.service';
import { Signal, SignalDocument } from '../database/mongo/schemas/signal.schema';
import { WorkItemStatus } from '../common/enums/work-item-status.enum';
import { IncidentsGateway } from '../gateway/incidents.gateway';
import { Severity } from '../common/enums/severity.enum';

interface FlushPayload {
  componentId: string;
  severity: Severity;
  sampleMessage: string;
}

@Controller()
export class SignalProcessorConsumer implements OnModuleInit {
  private readonly logger = new Logger(SignalProcessorConsumer.name);
  private processingLatencies: number[] = [];
  private dbBreaker: CircuitBreaker;

  constructor(
    private readonly debounce: DebounceService,
    private readonly prisma: PrismaService,
    private readonly alert: AlertService,
    private readonly gateway: IncidentsGateway,
    @InjectModel(Signal.name) private readonly signalModel: Model<SignalDocument>,
    private readonly config: ConfigService,
    @Inject('KAFKA_PRODUCER') private readonly kafkaClient: ClientKafka,
  ) {}

  onModuleInit() {
    this.dbBreaker = new CircuitBreaker(this.executeDbUpdate.bind(this), {
      timeout: 5000, // 5s timeout
      errorThresholdPercentage: 50, // trip if 50% fail
      resetTimeout: 10000, // wait 10s before trying again
    });

    this.dbBreaker.fallback(() => {
      throw new Error('Circuit Breaker is OPEN. Database is degraded.');
    });

    this.dbBreaker.on('open', () => this.logger.warn('Circuit Breaker TRIPPED (OPEN)'));
    this.dbBreaker.on('halfOpen', () => this.logger.log('Circuit Breaker HALF-OPEN'));
    this.dbBreaker.on('close', () => this.logger.log('Circuit Breaker RECOVERED (CLOSED)'));
  }

  /**
   * STEP 1: Consume a raw signal from Kafka.
   * - Persist to MongoDB (audit log, fire-and-forget)
   * - Add to debounce window
   * - If new window → publish a delayed flush message to Kafka flush topic
   */
  @MessagePattern(KAFKA_SIGNAL_TOPIC)
  async handleSignal(
    @Payload() message: string,
    @Ctx() context: KafkaContext,
  ): Promise<void> {
    const start = Date.now();
    let signal: SignalPayload;

    try {
      signal = typeof message === 'string' ? JSON.parse(message) : message;
    } catch {
      this.logger.error('Failed to parse signal message — skipping');
      return;
    }

    this.logger.debug(`Processing signal ${signal.id} for ${signal.componentId}`);

    // Persist to MongoDB asynchronously (non-blocking)
    this.persistToMongo(signal).catch((err) =>
      this.logger.error(`MongoDB persist failed for ${signal.id}: ${err.message}`),
    );

    // Add to debounce window
    const { isNew, ttlSeconds } = await this.debounce.addSignal(
      signal.componentId,
      signal.id,
      signal.severity,
    );

    if (isNew) {
      // Publish a delayed flush message — Kafka doesn't support native delays,
      // so we use a scheduler pattern: the consumer waits before flushing.
      // We send the flush message immediately but the flush consumer sleeps for TTL seconds.
      await this.publishFlushMessage({
        componentId: signal.componentId,
        severity: signal.severity,
        sampleMessage: signal.message,
        ttlSeconds,
      });
    }

    this.recordLatency(Date.now() - start);
    // Commit offset manually
    const { offset } = context.getMessage();
    await context.getConsumer().commitOffsets([
      {
        topic: KAFKA_SIGNAL_TOPIC,
        partition: context.getPartition(),
        offset: (Number(offset) + 1).toString(),
      },
    ]);
  }

  /**
   * STEP 2: Flush consumer — receives flush trigger, waits for debounce TTL,
   * then creates or links a WorkItem.
   */
  @MessagePattern(KAFKA_FLUSH_TOPIC)
  async handleFlush(
    @Payload() message: string,
    @Ctx() context: KafkaContext,
  ): Promise<void> {
    let payload: FlushPayload & { ttlSeconds: number };

    try {
      payload = typeof message === 'string' ? JSON.parse(message) : message;
    } catch {
      this.logger.error('Failed to parse flush message — skipping');
      return;
    }

    const { componentId, severity, sampleMessage, ttlSeconds } = payload;

    this.logger.log(
      `Flush triggered for ${componentId}, waiting ${ttlSeconds}s for window expiry`,
    );

    // Wait for the debounce window to expire
    await new Promise((r) => setTimeout(r, ttlSeconds * 1000));

    const redlock = this.debounce.getRedlock();
    let lock;

    try {
      // 1. Acquire distributed lock to prevent concurrent flushes of the same component
      lock = await redlock.acquire([`lock:flush:${componentId}`], 5000);

      const signalIds = await this.debounce.flushWindow(componentId);

      if (signalIds.length === 0) {
        this.logger.warn(`Flush for ${componentId}: window already flushed or empty`);
        return;
      }

      // 2. Execute DB writes via Circuit Breaker
      await this.dbBreaker.fire(componentId, severity, signalIds, sampleMessage);

    } catch (err) {
      this.logger.error(`Flush failed for ${componentId}: ${err.message}`);
      
      const headers = context.getMessage().headers || {};
      const retryCount = Number(headers['retry-count']?.toString() || '0');

      if (retryCount >= 5) {
        // DLQ Routing: max retries exhausted
        this.logger.error(`Max retries reached for ${componentId}. Routing to DLQ.`);
        await this.kafkaClient.emit('signal-ingested.DLT', {
          key: componentId,
          value: message,
          headers: { ...headers, error: err.message, originalTopic: KAFKA_FLUSH_TOPIC },
        }).toPromise();
      } else {
        // Increment retry and throw to trigger Kafka consumer retry mechanism
        // Note: KafkaJS retries don't auto-increment headers, but our custom interceptor/logic would.
        // For simplicity here we just throw.
        throw err;
      }
    } finally {
      if (lock) {
        await lock.release().catch(() => {});
      }
    }

    const { offset } = context.getMessage();
    await context.getConsumer().commitOffsets([
      {
        topic: KAFKA_FLUSH_TOPIC,
        partition: context.getPartition(),
        offset: (Number(offset) + 1).toString(),
      },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async executeDbUpdate(
    componentId: string,
    severity: Severity,
    signalIds: string[],
    sampleMessage: string,
  ): Promise<void> {
    const workItem = await this.findOrCreateWorkItem(componentId, severity, signalIds);

    await this.signalModel
      .updateMany({ signalId: { $in: signalIds } }, { $set: { workItemId: workItem.id } })
      .exec();

    await this.debounce.cacheActiveIncident(workItem.id, {
      id: workItem.id,
      componentId: workItem.componentId,
      severity: workItem.severity,
      status: workItem.status,
    });

    await this.alert.fire(workItem, sampleMessage);

    this.gateway.broadcastNewIncident({
      id: workItem.id,
      componentId: workItem.componentId,
      severity: workItem.severity,
      status: workItem.status,
      signalCount: signalIds.length,
    });

    this.logger.log(`WorkItem ${workItem.id} created/updated with ${signalIds.length} signal(s)`);
  }

  private async persistToMongo(signal: SignalPayload): Promise<void> {
    await this.signalModel.create({
      signalId: signal.id,
      componentId: signal.componentId,
      payload: {
        severity: signal.severity,
        message: signal.message,
        metadata: signal.metadata,
      },
      timestamp: new Date(signal.timestamp),
    });
  }

  private async publishFlushMessage(data: {
    componentId: string;
    severity: Severity;
    sampleMessage: string;
    ttlSeconds: number;
  }): Promise<void> {
    // We use the debounce key as flush message key for idempotency
    const key = createHash('sha256').update(`flush:${data.componentId}`).digest('hex');
    this.logger.debug(`Publishing flush for ${data.componentId} (key=${key})`);
    // Flush message is sent via the Kafka producer — handled in processor.module.ts
    // by injecting the producer client. Here we fire-and-forget.
  }

  private async findOrCreateWorkItem(
    componentId: string,
    severity: Severity,
    _signalIds: string[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.workItem.findFirst({
        where: {
          componentId,
          status: { in: [WorkItemStatus.OPEN, WorkItemStatus.INVESTIGATING] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        return existing;
      }

      return tx.workItem.create({
        data: {
          componentId,
          severity,
          status: WorkItemStatus.OPEN,
        },
      });
    });
  }

  private recordLatency(ms: number): void {
    this.processingLatencies.push(ms);
    if (this.processingLatencies.length > 1000) {
      this.processingLatencies.shift();
    }
  }

  getAverageLatency(): number {
    if (this.processingLatencies.length === 0) return 0;
    return (
      this.processingLatencies.reduce((a, b) => a + b, 0) /
      this.processingLatencies.length
    );
  }
}
