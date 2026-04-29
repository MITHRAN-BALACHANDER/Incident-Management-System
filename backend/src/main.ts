import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import {
  KAFKA_CLIENT_ID,
  KAFKA_CONSUMER_GROUP_ID,
  KAFKA_SIGNAL_TOPIC,
  KAFKA_FLUSH_TOPIC,
} from './queue/queue.constants';

async function bootstrap() {
  // --- HTTP Application ---
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  // Global input validation (whitelist strips unknown props)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // WebSocket adapter (Socket.io)
  app.useWebSocketAdapter(new IoAdapter(app));

  app.enableCors();

  // --- Kafka Microservice (consumer) ---
  const kafkaBrokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: `${KAFKA_CLIENT_ID}-consumer`,
        brokers: kafkaBrokers,
      },
      consumer: {
        groupId: KAFKA_CONSUMER_GROUP_ID,
        allowAutoTopicCreation: true,
        retry: {
          retries: 8,
          initialRetryTime: 300,
          factor: 2, // exponential backoff
          maxRetryTime: 30000,
        },
      },
      subscribe: {
        topics: [KAFKA_SIGNAL_TOPIC, KAFKA_FLUSH_TOPIC],
        fromBeginning: false,
      },
      run: {
        autoCommit: false, // manual offset commits for exactly-once processing
        partitionsConsumedConcurrently: 100, // backpressure: scale up to 100 partitions
        eachBatchAutoResolve: false,
      },
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`🚀 PulseGuard API running on http://localhost:${port}`);
  console.log(`📡 WebSocket gateway active on ws://localhost:${port}`);
  console.log(`🔵 Kafka consumer listening on topics: ${KAFKA_SIGNAL_TOPIC}, ${KAFKA_FLUSH_TOPIC}`);
}

bootstrap();
