import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsResponse,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { WebsocketService, MessagePayload } from './websocket.service'; // Assuming interfaces are exported from service or a types file

@WebSocketGateway({
  cors: {
    origin: '*', // Em produção, restrinja para o seu domínio do frontend
  },
  // path: '/socket.io', // Opcional: defina um caminho específico se necessário
})
export class WebsocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server: Server;
  private readonly logger = new Logger(WebsocketGateway.name);

  constructor(private readonly websocketService: WebsocketService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized');
    this.websocketService.initialize(server); // Passa a instância do servidor para o serviço
  }

  handleConnection(client: Socket, ...args: any[]) {
    const workspaceId: string = client.handshake.auth.workspaceId;

    this.logger.log(`Connected client: ${workspaceId}, IP: ${client.handshake.address}`);

    if (workspaceId) {
      client.join(workspaceId);
      this.logger.log(`Client ${client.id} joined workspace room: ${workspaceId}`);
    }

    client.emit('connectionStatus', {
      status: 'Successfully connected!',
      workspaceId,
    });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Disconnected client: ${client.handshake.auth.userId}`);
    // Adicionar lógica de limpeza se necessário, como remover o cliente de todas as salas em que estava
    // O WebsocketService poderia ter um método para isso, se a lógica for complexa.
    // Ex: this.websocketService.handleClientDisconnection(client);
  }
}