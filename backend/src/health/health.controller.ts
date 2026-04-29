import { Controller, Get, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import { DebounceService } from '../debounce/debounce.service';
import { SignalProducerService } from '../queue/signal-producer.service';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller()
export class HealthController implements OnModuleInit {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly debounce: DebounceService,
    private readonly producer: SignalProducerService,
    @InjectConnection() private readonly mongoConnection: Connection,
  ) {}

  onModuleInit(): void {
    // Log observability metrics every 5 seconds
    setInterval(async () => {
      const [pgOk, redisOk] = await Promise.all([
        this.prisma.healthCheck(),
        this.debounce.healthCheck(),
      ]);

      this.logger.log(
        `[METRICS] signals/sec=${this.producer.getSignalsPerSecond()} | pg=${pgOk ? 'ok' : 'down'} | redis=${redisOk ? 'ok' : 'down'} | mongo=${this.mongoConnection.readyState === 1 ? 'ok' : 'down'}`,
      );
    }, 5000);
  }

  @Get('health')
  async health() {
    const [pgOk, redisOk] = await Promise.all([
      this.prisma.healthCheck(),
      this.debounce.healthCheck(),
    ]);

    const mongoOk = this.mongoConnection.readyState === 1;
    const healthy = pgOk && redisOk && mongoOk;

    return {
      status: healthy ? 'ok' : 'degraded',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        postgres: pgOk ? 'ok' : 'down',
        redis: redisOk ? 'ok' : 'down',
        mongodb: mongoOk ? 'ok' : 'down',
      },
      metrics: {
        signalsPerSecond: this.producer.getSignalsPerSecond(),
      },
    };
  }
}
