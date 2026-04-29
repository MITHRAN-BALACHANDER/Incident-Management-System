import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './database/prisma/prisma.module';
import { MongoModule } from './database/mongo/mongo.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { QueueModule } from './queue/queue.module';
import { ProcessorModule } from './processor/processor.module';
import { WorkflowModule } from './workflow/workflow.module';
import { AlertModule } from './alert/alert.module';
import { RcaModule } from './rca/rca.module';
import { IncidentsModule } from './incidents/incidents.module';
import { GatewayModule } from './gateway/gateway.module';
import { HealthModule } from './health/health.module';
import { DebounceModule } from './debounce/debounce.module';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    // Config — available everywhere via ConfigService
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting — guards ingestion endpoint
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 1000,
        limit: 500,
      },
    ]),

    // Observability & Telemetry
    PrometheusModule.register(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
      },
    }),

    // Database layers (both global)
    PrismaModule,
    MongoModule,

    // Feature modules
    DebounceModule,
    QueueModule,
    IngestionModule,
    ProcessorModule,
    WorkflowModule,
    AlertModule,
    RcaModule,
    IncidentsModule,
    GatewayModule,
    HealthModule,
  ],
})
export class AppModule {}
