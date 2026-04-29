import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SignalProcessorConsumer } from './signal-processor.consumer';
import { DebounceModule } from '../debounce/debounce.module';
import { AlertModule } from '../alert/alert.module';
import { Signal, SignalSchema } from '../database/mongo/schemas/signal.schema';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    DebounceModule,
    AlertModule,
    GatewayModule,
    MongooseModule.forFeature([{ name: Signal.name, schema: SignalSchema }]),
  ],
  controllers: [SignalProcessorConsumer],
})
export class ProcessorModule {}
