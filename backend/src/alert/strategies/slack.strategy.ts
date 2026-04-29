import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkItem } from '@prisma/client';
import axios from 'axios';
import { IAlertStrategy } from './alert-strategy.interface';

@Injectable()
export class SlackStrategy implements IAlertStrategy {
  private readonly logger = new Logger(SlackStrategy.name);

  constructor(private readonly config: ConfigService) {}

  async fire(workItem: WorkItem, message: string): Promise<void> {
    const webhookUrl = this.config.get<string>('SLACK_WEBHOOK_URL');

    if (!webhookUrl) {
      this.logger.warn(
        `Slack alert skipped for ${workItem.id}: SLACK_WEBHOOK_URL not configured.`,
      );
      return;
    }

    const severityEmoji = workItem.severity === 'P0' ? '🔴' : workItem.severity === 'P1' ? '🟠' : '🟡';

    const payload = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${severityEmoji} PulseGuard Alert — ${workItem.severity}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Component:*\n${workItem.componentId}` },
            { type: 'mrkdwn', text: `*Severity:*\n${workItem.severity}` },
            { type: 'mrkdwn', text: `*Status:*\n${workItem.status}` },
            { type: 'mrkdwn', text: `*Incident ID:*\n${workItem.id}` },
          ],
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*Message:*\n${message}` },
        },
      ],
    };

    try {
      await axios.post(webhookUrl, payload, { timeout: 5000 });
      this.logger.log(`Slack alert sent for WorkItem ${workItem.id}`);
    } catch (err) {
      this.logger.error(`Slack alert failed for ${workItem.id}: ${err.message}`);
    }
  }
}
