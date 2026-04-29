import { Injectable, Logger } from '@nestjs/common';
import { WorkItem } from '@prisma/client';
import { Severity } from '../common/enums/severity.enum';
import { IAlertStrategy } from './strategies/alert-strategy.interface';
import { EmailStrategy } from './strategies/email.strategy';
import { SlackStrategy } from './strategies/slack.strategy';

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly email: EmailStrategy,
    private readonly slack: SlackStrategy,
  ) {}

  /**
   * Fire alert strategies based on severity.
   * P0 → email + slack
   * P1 → slack only
   * P2 → log only
   *
   * Strategies run concurrently and failures are isolated.
   */
  async fire(workItem: WorkItem, message: string): Promise<void> {
    const strategies: IAlertStrategy[] = [];

    switch (workItem.severity as Severity) {
      case Severity.P0:
        strategies.push(this.email, this.slack);
        break;
      case Severity.P1:
        strategies.push(this.slack);
        break;
      case Severity.P2:
        this.logger.log(
          `[P2 Alert] Component: ${workItem.componentId}, WorkItem: ${workItem.id} — ${message}`,
        );
        return;
    }

    await Promise.allSettled(
      strategies.map((s) =>
        s.fire(workItem, message).catch((err) =>
          this.logger.error(`Alert strategy ${s.constructor.name} failed: ${err.message}`),
        ),
      ),
    );
  }
}
