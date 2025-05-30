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

  @SubscribeMessage('joinChat')
  handleJoinChat(
    @MessageBody() data: { chatId: string },
    @ConnectedSocket() client: Socket,
  ): void { // Pode retornar WsResponse se quiser enviar uma confirmação específica
    this.logger.log(`Cliente ${client.id} tentando entrar no chat: ${data.chatId}`);
    this.websocketService.joinChatRoom(client, data.chatId);
    // O serviço já emite 'joinedChat' e 'error' se necessário
  }

  @SubscribeMessage('leaveChat')
  handleLeaveChat(
    @MessageBody() data: { chatId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    this.logger.log(`Cliente ${client.id} tentando sair do chat: ${data.chatId}`);
    this.websocketService.leaveChatRoom(client, data.chatId);
    // O serviço já emite 'leftChat' e 'error' se necessário
  }

  @SubscribeMessage('sendMessageToChat')
  handleSendMessageToChat(
    @MessageBody() payload: { chatId: string; content: string },
    @ConnectedSocket() client: Socket,
  ): void {
    const { chatId, content } = payload;
    if (!chatId || !content) {
      this.logger.warn(`Mensagem inválida de ${client.id}: chatId ou content ausente.`);
      client.emit('error', { message: 'chatId e content são obrigatórios para enviar mensagem.' });
      return;
    }

    const message: MessagePayload = {
      content,
      senderId: client.id, // ID do socket do remetente
      chatId,
      timestamp: new Date(),
    };

    this.logger.log(`Mensagem de ${client.id} para o chat ${chatId}: ${content}`);
    // O serviço lida com o envio para a sala
    this.websocketService.sendToChatRoom(chatId, 'newMessageInChat', message);
    // Opcional: enviar uma confirmação de volta para o remetente
    // return { event: 'messageSentConfirmation', data: { chatId, content, timestamp: message.timestamp } };
  }

  // Exemplo de como o frontend poderia solicitar o envio de uma DM para outro usuário (via backend)
  // O backend então usaria o WebsocketService para enviar a DM.
  // @SubscribeMessage('sendDirectMessageToServer')
  // handleSendDirectMessageToServer(
  //   @MessageBody() payload: { recipientId: string; content: string },
  //   @ConnectedSocket() client: Socket,
  // ): void {
  //   this.logger.log(`Cliente ${client.id} solicitando envio de DM para ${payload.recipientId}`);
  //   // Aqui você pode ter lógica de negócios, como verificar se o remetente pode enviar DM para o destinatário
  //   // E então usar o serviço:
  //   const dmPayload: DirectMessageToClientPayload = {
  //       content: payload.content,
  //       senderId: client.id, // ou um ID de usuário do sistema se autenticado
  //       recipientId: payload.recipientId,
  //       timestamp: new Date()
  //   };
  //   const success = this.websocketService.sendToClient(payload.recipientId, 'directMessage', dmPayload);
  //   if (success) {
  //       client.emit('directMessageSentConfirmation', { recipientId: payload.recipientId, status: 'Enviada' });
  //   } else {
  //       client.emit('error', { message: `Não foi possível enviar DM para ${payload.recipientId}. Cliente pode não estar conectado.` });
  //   }
  // }

  // O WebsocketGateway não precisa mais dos métodos:
  // - sendMessageToSpecificClient (isso agora é responsabilidade do WebsocketService e chamado por outros services)
  // - sendMessageToChatFromServer (isso agora é responsabilidade do WebsocketService e chamado por outros services)
}