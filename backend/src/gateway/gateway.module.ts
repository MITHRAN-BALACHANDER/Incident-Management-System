import { Module, OnModuleInit } from '@nestjs/common';
import { IncidentsGateway } from './incidents.gateway';
import { WorkflowModule } from '../workflow/workflow.module';
import { WorkflowService } from '../workflow/workflow.service';
import { RcaModule } from '../rca/rca.module';
import { RcaService } from '../rca/rca.service';

/**
 * GatewayModule wires the WebSocket gateway's broadcast function into
 * WorkflowService and RcaService to avoid circular DI.
 */
@Module({
  imports: [WorkflowModule, RcaModule],
  providers: [IncidentsGateway],
  exports: [IncidentsGateway],
})
export class GatewayModule implements OnModuleInit {
  constructor(
    private readonly gateway: IncidentsGateway,
    private readonly workflow: WorkflowService,
    private readonly rca: RcaService,
  ) {}

  onModuleInit(): void {
    // Register the gateway's broadcast fn into services that need it
    this.workflow.registerGateway(this.gateway.broadcast.bind(this.gateway));
    this.rca.registerGateway(this.gateway.broadcast.bind(this.gateway));
  }
}
