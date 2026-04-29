import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Severity } from '../common/enums/severity.enum';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { SignalProducerService } from '../queue/signal-producer.service';
import { CreateSignalDto } from './dto/create-signal.dto';

/**
 * Ingestion controller — the system's front door.
 * Validates → assigns ID → enqueues → returns 202. That's all.
 * NO business logic lives here.
 */
@Controller()
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(private readonly producer: SignalProducerService) {}

  @Post('signals')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 500, ttl: 1000 } }) // 500 req/s per IP
  async ingest(@Body() dto: CreateSignalDto): Promise<{ accepted: true; signalId: string }> {
    // Load Shedding: Drop P2 traffic if system is severely backlogged
    if (dto.severity === Severity.P2 && this.producer.isOverloaded()) {
      this.logger.warn(`Load Shedding active: Dropped P2 signal for ${dto.componentId}`);
      throw new ServiceUnavailableException('System overloaded, dropping non-critical traffic');
    }

    const signalId = randomUUID();

    await this.producer.push({
      id: signalId,
      componentId: dto.componentId,
      severity: dto.severity,
      message: dto.message,
      timestamp: dto.timestamp,
      metadata: dto.metadata ?? {},
    });

    this.logger.debug(`Signal accepted: ${signalId} (${dto.componentId} / ${dto.severity})`);
    return { accepted: true, signalId };
  }
}
