import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

// Interfaces podem ser movidas para um arquivo de tipos dedicado (e.g., websocket.types.ts)
export interface MessagePayload {
  content: string;
  senderId?: string; // ID do socket do remetente ou ID do usuário do sistema
  chatId: string;
  timestamp: Date;
}

export interface DirectMessageToClientPayload {
  content: string;
  senderId?: string; // ID do socket do remetente ou ID do usuário do sistema
  recipientId: string; // O ID do socket do cliente de destino
  timestamp: Date;
}

@Injectable()
export class WebsocketService {
  private server: Server;
  private readonly logger = new Logger(WebsocketService.name);

  /**
   * Método para o Gateway injetar a instância do servidor Socket.IO.
   * Deve ser chamado no hook onGatewayInit do Gateway.
   */
  initialize(server: Server): void {
    this.server = server;
    this.logger.log('Socket.IO Server instance set in WebsocketService');
  }

  /**
   * Envia uma mensagem para um cliente específico usando seu socketId.
   * @param targetClientId O ID do socket do cliente de destino.
   * @param eventName O nome do evento a ser emitido para o cliente.
   * @param payload O conteúdo da mensagem.
   */
  sendToClient(targetClientId: string, eventName: string, payload: any): boolean {
    if (!this.server) {
      this.logger.error('Socket.IO Server not initialized in WebsocketService. Call initialize() first.');
      return false;
    }
    // O método .to() do servidor Socket.IO direciona a mensagem para o socketId fornecido.
    const result = this.server.to(targetClientId).emit(eventName, payload);
    if (result) {
        this.logger.log(`Message sent to client ${targetClientId} on event ${eventName}`);
    } else {
        // Isso pode acontecer se o namespace não existir ou se houver um problema interno no socket.io
        // mas geralmente, se o socketId não for encontrado, ele simplesmente não envia sem erro explícito aqui.
        // A verificação se o cliente existe pode ser feita antes se necessário.
        this.logger.warn(`Attempted to send message to client ${targetClientId} on event ${eventName}, but emit returned false (client might not be connected or room might not exist).`);
    }
    return result;
  }

   /**
   * Desconecta um cliente específico pelo seu socketId.
   * @param clientId O ID do socket do cliente a ser desconectado.
   * @param closeConnection Se true, fecha a conexão subjacente. Default: false.
   */
  disconnectClient(clientId: string, closeConnection: boolean = false): void {
    if (!this.server) {
      this.logger.error('Socket.IO Server not initialized in WebsocketService.');
      return;
    }
    const clientSocket = this.server.sockets.sockets.get(clientId);
    if (clientSocket) {
      clientSocket.disconnect(closeConnection);
      this.logger.log(`Client ${clientId} has been disconnected.`);
    } else {
      this.logger.warn(`Client ${clientId} not found for disconnection.`);
    }
  }
}
