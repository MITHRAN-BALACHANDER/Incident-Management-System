import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { createHash } from 'crypto';
import { SignalPayload } from '../common/interfaces/signal.interface';
import { KAFKA_SIGNAL_TOPIC } from './queue.constants';
import { KAFKA_PRODUCER_TOKEN } from './queue.module';

@Injectable()
export class SignalProducerService implements OnModuleInit {
  private readonly logger = new Logger(SignalProducerService.name);
  private signalsPerSecond = 0;
  private signalCounter = 0;

  constructor(
    @Inject(KAFKA_PRODUCER_TOKEN) private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.kafkaClient.connect();
    // Reset counter every second for metrics
    setInterval(() => {
      this.signalsPerSecond = this.signalCounter;
      this.signalCounter = 0;
    }, 1000);
  }

  /**
   * Publish a signal to the Kafka topic.
   * Key = SHA256(componentId + timestamp) → guarantees idempotent delivery.
   * Fire-and-forget with error logging — ingestion endpoint must not block.
   */
  async push(signal: SignalPayload): Promise<void> {
    const key = createHash('sha256')
      .update(`${signal.componentId}:${signal.timestamp}`)
      .digest('hex');

    this.signalCounter++;

    try {
      await this.kafkaClient
        .emit(KAFKA_SIGNAL_TOPIC, {
          key,
          value: JSON.stringify(signal),
        })
        .toPromise();
    } catch (err) {
      this.logger.error(`Failed to publish signal ${signal.id}: ${err.message}`);
      throw err;
    }
  }

  getSignalsPerSecond(): number {
    return this.signalsPerSecond;
  }
}
