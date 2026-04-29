import { WorkItem } from '@prisma/client';

export interface IAlertStrategy {
  fire(workItem: WorkItem, message: string): Promise<void>;
}

export const ALERT_STRATEGY_TOKEN = 'ALERT_STRATEGIES';
