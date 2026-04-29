import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SignalDocument = Signal & Document;

@Schema({
  collection: 'signals',
  timestamps: true,
  timeseries: {
    timeField: 'timestamp',
    metaField: 'componentId',
    granularity: 'seconds',
  },
})
export class Signal {
  @Prop({ required: true, index: true })
  componentId: string;

  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;

  @Prop({ index: true })
  workItemId: string;

  @Prop({ required: true, index: true })
  timestamp: Date;

  @Prop({ required: true, unique: true })
  signalId: string;
}

export const SignalSchema = SchemaFactory.createForClass(Signal);
