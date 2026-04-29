import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { WorkItem } from '@prisma/client';
import { IAlertStrategy } from './alert-strategy.interface';

@Injectable()
export class EmailStrategy implements IAlertStrategy {
  private readonly logger = new Logger(EmailStrategy.name);

  constructor(private readonly config: ConfigService) {}

  async fire(workItem: WorkItem, message: string): Promise<void> {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPort = this.config.get<number>('SMTP_PORT', 587);
    const smtpUser = this.config.get<string>('SMTP_USER');
    const smtpPass = this.config.get<string>('SMTP_PASS');
    const alertEmail = this.config.get<string>('ALERT_EMAIL', 'ops@pulseguard.io');

    if (!smtpHost || !smtpUser || !smtpPass) {
      this.logger.warn(
        `Email alert skipped for ${workItem.id}: SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS.`,
      );
      return;
    }

    const transporter = createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    try {
      await transporter.sendMail({
        from: `"PulseGuard Alerts" <${smtpUser}>`,
        to: alertEmail,
        subject: `[${workItem.severity}] Incident: ${workItem.componentId}`,
        html: `
          <h2>🚨 PulseGuard Alert — ${workItem.severity}</h2>
          <p><strong>Component:</strong> ${workItem.componentId}</p>
          <p><strong>Incident ID:</strong> ${workItem.id}</p>
          <p><strong>Message:</strong> ${message}</p>
          <p><strong>Status:</strong> ${workItem.status}</p>
          <p><strong>Created:</strong> ${workItem.createdAt.toISOString()}</p>
        `,
      });
      this.logger.log(`Email alert sent for WorkItem ${workItem.id}`);
    } catch (err) {
      this.logger.error(`Email alert failed for ${workItem.id}: ${err.message}`);
    }
  }
}
