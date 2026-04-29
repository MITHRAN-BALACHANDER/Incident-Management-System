import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Signal, SignalSchema } from './schemas/signal.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGO_URI'),
        retryWrites: true,
        w: 'majority',
      }),
    }),
    MongooseModule.forFeature([{ name: Signal.name, schema: SignalSchema }]),
  ],
  exports: [MongooseModule],
})
export class MongoModule {}
