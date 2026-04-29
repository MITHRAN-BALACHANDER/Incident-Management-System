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
