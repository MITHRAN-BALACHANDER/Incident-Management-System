import { Severity } from '../enums/severity.enum';

export interface SignalPayload {
  id: string;
  componentId: string;
  severity: Severity;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}
