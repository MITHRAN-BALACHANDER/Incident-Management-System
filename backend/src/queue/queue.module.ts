import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { KAFKA_CLIENT_ID, KAFKA_CONSUMER_GROUP_ID } from './queue.constants';
import { SignalProducerService } from './signal-producer.service';

export const KAFKA_PRODUCER_TOKEN = 'KAFKA_PRODUCER';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: KAFKA_PRODUCER_TOKEN,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: KAFKA_CLIENT_ID,
              brokers: config.get<string>('KAFKA_BROKERS', 'localhost:9092').split(','),
            },
            producer: {
              idempotent: true,
              allowAutoTopicCreation: true,
            },
            consumer: {
              groupId: KAFKA_CONSUMER_GROUP_ID,
            },
          },
        }),
      },
    ]),
  ],
  providers: [SignalProducerService],
  exports: [SignalProducerService],
})
export class QueueModule {}
