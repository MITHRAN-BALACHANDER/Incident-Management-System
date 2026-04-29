import { Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { EmailStrategy } from './strategies/email.strategy';
import { SlackStrategy } from './strategies/slack.strategy';

@Module({
  providers: [AlertService, EmailStrategy, SlackStrategy],
  exports: [AlertService],
})
export class AlertModule {}
