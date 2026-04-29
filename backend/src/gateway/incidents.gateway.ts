import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  namespace: '/',
})
export class IncidentsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(IncidentsGateway.name);

  afterInit(): void {
    this.logger.log('WebSocket gateway initialized');
  }

  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /**
   * Broadcast a new incident to all connected clients.
   */
  broadcastNewIncident(workItem: Record<string, unknown>): void {
    this.server.emit('incident.created', workItem);
    this.logger.debug(`Broadcast incident.created: ${workItem['id']}`);
  }

  /**
   * Broadcast a status change to all connected clients.
   */
  broadcastStatusChange(data: Record<string, unknown>): void {
    this.server.emit('incident.status_changed', data);
    this.logger.debug(`Broadcast incident.status_changed: ${data['id']} → ${data['status']}`);
  }

  /**
   * Broadcast RCA creation event.
   */
  broadcastRcaCreated(data: Record<string, unknown>): void {
    this.server.emit('rca.created', data);
    this.logger.debug(`Broadcast rca.created for workItem: ${data['workItemId']}`);
  }

  /**
   * Generic broadcast — used by WorkflowService and RcaService via callback.
   */
  broadcast(event: string, data: unknown): void {
    this.server.emit(event, data);
  }
}
