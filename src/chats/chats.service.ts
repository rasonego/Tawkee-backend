import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { ChatDto } from './dto/chat.dto';
import { MessageDto } from './dto/message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { WahaApiService } from '../waha-api/waha-api.service';
import { WebsocketService } from 'src/websocket/websocket.service';
import { InteractionsService } from 'src/interactions/interactions.service';
import { Message } from '@prisma/client';

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaApiService: WahaApiService,
    private readonly websocketService: WebsocketService,
    private readonly interactionsService: InteractionsService
  ) {}

  async findByContextId(contextId: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { contextId },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with contextId ${contextId} not found`);
    }

    return chat;
  }

  async findChatsByWorkspace(
    workspaceId: string,
    paginationDto: PaginationDto,
    agentId?: string
  ): Promise<PaginatedResult<ChatDto>> {
    const { page, pageSize, query } = paginationDto;
    const skip = (page - 1) * pageSize;

    // Build the where clause
    const where = {
      workspaceId,
      ...(agentId ? { agentId } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' as any } },
              { recipient: { contains: query, mode: 'insensitive' as any } },
            ],
          }
        : {}),
    };

    // Get total count for pagination metadata
    const total = await this.prisma.chat.count({ where });

    // Get chats with pagination
    const chats = await this.prisma.chat.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [
        { finished: 'asc' },
        { unReadCount: 'desc' },
        { humanTalk: 'desc' },
        { updatedAt: 'desc' },
      ],
      include: {
        agent: {
          select: {
            id: true,
            name: true,
          },
        },
        interactions: {
          orderBy: { startAt: 'desc' },
          take: 1,
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    // Helper function to safely convert BigInt fields to string
    const mapMessageToDto = (message: any) => {
      if (!message) return null;
      return {
        ...message,
        whatsappTimestamp: message.whatsappTimestamp
          ? message.whatsappTimestamp.toString()
          : null,
        time: message.time ? message.time.toString() : null,
      };
    };

    // Format the response to match the expected structure
    const formattedChats = chats.map((chat) => {
      const latestInteraction = chat.interactions?.[0];
      const latestMessage = latestInteraction?.messages?.[0];

      return {
        ...this.formatChatResponse(chat),
        latestMessage: mapMessageToDto(latestMessage),
      };
    });

    return {
      data: formattedChats,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async finishChat(
    chatId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        finished: true,
        read: true,
        updatedAt: new Date(),
      },
    });

    await this.prisma.interaction.updateMany({
      where: {
        chatId,
        status: {
          in: ['RUNNING', 'WAITING'],
        },
      },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
      },
    });

    // Find latest interaction
    const latestInteraction = await this.prisma.interaction.findFirst({
      where: { chatId },
      orderBy: { startAt: 'desc' },
      select: {
        id: true,
      },
    });

    // Find user who joined the conversation
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        agentId: true,
        title: true,
        name: true,
        userName: true,
        userPicture: true,
        whatsappPhone: true,
        humanTalk: true,
        read: true,
        finished: true,
        unReadCount: true,
      },
    });

    // Find the agent who left the conversation
    const agent = await this.prisma.agent.findFirst({
      where: { id: chat.agentId },
      select: { id: true, workspaceId: true, name: true },
    });

    // Create a new message indicating the start of human attendance
    const systemMessage = await this.prisma.message.create({
      data: {
        text: `${user.name} finished conversation.`,
        role: 'system',
        type: 'notification',
        chatId,
        interactionId: latestInteraction.id,
        time: Date.now(),
      },
    });

    const latestInteractionUpdated =
      await this.interactionsService.findLatestInteractionByChatWithMessages(
        chat.id
      );

    // Send system message to frontend clients via websocket
    this.websocketService.sendToClient(agent.workspaceId, 'messageChatUpdate', {
      chat,
      latestInteraction: latestInteractionUpdated,
      latestMessage: {
        ...systemMessage,
        whatsappTimestamp: systemMessage?.whatsappTimestamp?.toString(),
        time: systemMessage?.time?.toString(),
      },
    });

    return { success: true };
  }

  async unfinishChat(
    chatId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    // First, update the chat
    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        finished: false,
        read: false,
        updatedAt: new Date(),
      },
    });

    // Find the most recent interaction
    const mostRecentInteraction = await this.prisma.interaction.findFirst({
      where: { chatId },
      orderBy: { startAt: 'desc' },
    });

    // Find the latest message to determine the role
    const latestMessage = await this.prisma.message.findFirst({
      where: { chatId, interactionId: mostRecentInteraction.id },
      orderBy: { createdAt: 'desc' },
    });

    const newStatus = latestMessage.role == 'user' ? 'WAITING' : 'RUNNING';

    // Update the most recent interaction's to WAITING
    if (mostRecentInteraction) {
      await this.prisma.interaction.update({
        where: { id: mostRecentInteraction.id },
        data: {
          status: newStatus,
          warnedAt: null,
          resolvedAt: null, // Clear resolvedAt since we're reopening the interaction
        },
      });
    }

    // Find user who joined the conversation
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
        agentId: true,
        title: true,
        name: true,
        userName: true,
        userPicture: true,
        whatsappPhone: true,
        humanTalk: true,
        read: true,
        finished: true,
        unReadCount: true,
      },
    });

    // Find the agent who left the conversation
    const agent = await this.prisma.agent.findFirst({
      where: { id: chat.agentId },
      select: { id: true, workspaceId: true, name: true },
    });

    // Create a new message indicating the start of human attendance
    const systemMessage = await this.prisma.message.create({
      data: {
        text: `${user.name} reopened conversation.`,
        role: 'system',
        type: 'notification',
        chatId,
        interactionId: mostRecentInteraction.id,
        time: Date.now(),
      },
    });

    const latestInteraction =
      await this.interactionsService.findLatestInteractionByChatWithMessages(
        chatId
      );

    // Send system message to frontend clients via websocket
    this.websocketService.sendToClient(agent.workspaceId, 'messageChatUpdate', {
      chat,
      latestInteraction,
      latestMessage: {
        ...systemMessage,
        whatsappTimestamp: systemMessage?.whatsappTimestamp?.toString(),
        time: systemMessage?.time?.toString(),
      },
    });

    return { success: true };
  }

  async readChat(id: string): Promise<{ success: boolean }> {
    await this.prisma.chat.update({
      where: { id },
      data: {
        read: true,
        unReadCount: 0,
      },
    });

    return { success: true };
  }

  async deleteChat(id: string): Promise<{ success: boolean }> {
    // Ensure chat exists
    const chat = await this.prisma.chat.findUnique({
      where: { id },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${id} not found`);
    }

    // Delete chat with cascading deletions
    await this.prisma.chat.delete({
      where: { id },
    });

    return { success: true };
  }

  async findMessagesByChatId(
    chatId: string,
    paginationDto: PaginationDto
  ): Promise<PaginatedResult<MessageDto>> {
    // Ensure chat exists
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${chatId} not found`);
    }

    const { page, pageSize } = paginationDto;
    const skip = (page - 1) * pageSize;

    // Get total count for pagination metadata
    const total = await this.prisma.message.count({
      where: { chatId },
    });

    // Get messages with pagination
    const messages = await this.prisma.message.findMany({
      where: { chatId },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'asc' },
    });

    // Format the response to match the expected structure
    const formattedMessages = messages.map((message) =>
      this.formatMessageResponse(message)
    );

    return {
      data: formattedMessages,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async deleteMessages(chatId: string): Promise<{ success: boolean }> {
    // Ensure chat exists
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${chatId} not found`);
    }

    // Delete all messages for this chat
    await this.prisma.message.deleteMany({
      where: { chatId },
    });

    return { success: true };
  }

  async startHumanAttendance(
    chatId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    // Ensure chat exists
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { agent: true },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${chatId} not found`);
    }

    // Update chat to indicate human attendance
    const chatUpdated = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        humanTalk: true,
        finished: false,
        updatedAt: new Date(),
        read: false,
        unReadCount: { increment: 1 },
      },
      select: {
        id: true,
        agentId: true,
        title: true,
        name: true,
        userName: true,
        userPicture: true,
        whatsappPhone: true,
        humanTalk: true,
        read: true,
        finished: true,
        unReadCount: true,
      },
    });

    // Find latest interaction
    const latestInteraction = await this.prisma.interaction.findFirst({
      where: { chatId },
      orderBy: { startAt: 'desc' },
      select: {
        id: true,
      },
    });

    // Mark latest interaction as RUNNING
    await this.prisma.interaction.update({
      where: { id: latestInteraction.id },
      data: {
        status: 'RUNNING',
        userId,
        warnedAt: null,
        resolvedAt: null, // Clear resolvedAt since we're reopening the interaction
      },
    });

    // Find user who joined the conversation
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    // Find the agent who left the conversation
    const agent = await this.prisma.agent.findFirst({
      where: { id: chat.agentId },
      select: { id: true, workspaceId: true, name: true },
    });

    // Create a new message indicating the start of human attendance
    const systemMessage = await this.prisma.message.create({
      data: {
        text: `${user.name} has joined the conversation. Agent ${agent.name} is on hold.`,
        role: 'system',
        type: 'notification',
        chatId,
        interactionId: latestInteraction.id,
        time: Date.now(),
      },
    });

    const latestInteractionUpdated =
      await this.interactionsService.findLatestInteractionByChatWithMessages(
        chatId
      );

    // Send system message to frontend clients via websocket
    this.websocketService.sendToClient(agent.workspaceId, 'messageChatUpdate', {
      chat: chatUpdated,
      latestInteraction: latestInteractionUpdated,
      latestMessage: {
        ...systemMessage,
        whatsappTimestamp: systemMessage?.whatsappTimestamp?.toString(),
        time: systemMessage?.time?.toString(),
      },
    });

    return { success: true };
  }

  async stopHumanAttendance(
    chatId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    // Ensure chat exists
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { agent: true },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${chatId} not found`);
    }

    // Update chat to stop human attendance
    const chatUpdated = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        humanTalk: false,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        agentId: true,
        title: true,
        name: true,
        userName: true,
        userPicture: true,
        whatsappPhone: true,
        humanTalk: true,
        read: true,
        finished: true,
        unReadCount: true,
      },
    });

    // Find latest interaction
    const latestInteraction = await this.prisma.interaction.findFirst({
      where: { chatId },
      orderBy: { startAt: 'desc' },
      select: {
        id: true,
      },
    });

    // Fetch latest message of the interaction
    const latestMessage = await this.prisma.message.findFirst({
      where: { interactionId: latestInteraction.id },
      orderBy: { createdAt: 'desc' },
      select: { role: true },
    });

    // Determine new status based on latest message role
    const newStatus = latestMessage?.role === 'user' ? 'WAITING' : 'RUNNING';

    // Update the interaction accordingly
    await this.prisma.interaction.update({
      where: { id: latestInteraction.id },
      data: {
        status: newStatus,
        warnedAt: null,
        resolvedAt: null, // Clear resolvedAt since we're reopening the interaction
      },
    });

    // Find user who left the conversation
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    // Find agent who joined the conversation
    const agent = await this.prisma.agent.findFirst({
      where: { id: chat.agentId },
      select: { id: true, workspaceId: true, name: true },
    });

    // Create a system message indicating the end of human attendance
    const systemMessage = await this.prisma.message.create({
      data: {
        text: `${user.name} has left the conversation. Agent ${agent.name} restarted attendance.`,
        role: 'system',
        type: 'notification',
        chatId,
        interactionId: latestInteraction.id,
        time: Date.now(),
      },
    });

    const latestInteractionUpdated =
      await this.interactionsService.findLatestInteractionByChatWithMessages(
        chatId
      );

    // Send system message to frontend clients via websocket
    this.websocketService.sendToClient(agent.workspaceId, 'messageChatUpdate', {
      chat: chatUpdated,
      latestInteraction: latestInteractionUpdated,
      latestMessage: {
        ...systemMessage,
        whatsappTimestamp: systemMessage?.whatsappTimestamp?.toString(),
        time: systemMessage?.time?.toString(),
      },
    });

    return { success: true };
  }

  async transferAttendanceToHuman(
    chatId: string
  ): Promise<{ success: boolean }> {
    // Ensure chat exists
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { agent: true },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${chatId} not found`);
    }

    // Update chat to indicate human attendance
    const chatUpdated = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        humanTalk: true,
        finished: false,
        updatedAt: new Date(),
        read: false,
        unReadCount: { increment: 1 },
      },
      select: {
        id: true,
        agentId: true,
        title: true,
        name: true,
        userName: true,
        userPicture: true,
        whatsappPhone: true,
        humanTalk: true,
        read: true,
        finished: true,
        unReadCount: true,
      },
    });

    // Find latest interaction
    const latestInteraction = await this.prisma.interaction.findFirst({
      where: { chatId },
      orderBy: { startAt: 'desc' },
      select: {
        id: true,
      },
    });

    // Find a user to transfer the chat to
    const user = await this.prisma.user.findFirst({
      where: { workspaceId: chat.workspaceId },
      select: { id: true, name: true },
    });

    if (!user) {
      throw new NotFoundException(
        `Not found human to transfer chat ID ${chatId} to`
      );
    }

    // Mark latest interaction as RUNNING
    await this.prisma.interaction.update({
      where: { id: latestInteraction.id },
      data: {
        status: 'WAITING',
        userId: user.id,
        warnedAt: null,
        resolvedAt: null, // Clear resolvedAt since we're reopening the interaction
      },
    });

    // Find the agent who left the conversation
    const agent = await this.prisma.agent.findFirst({
      where: { id: chat.agentId },
      select: { id: true, workspaceId: true, name: true },
    });

    // Create a new message indicating the start of human attendance
    const systemMessage = await this.prisma.message.create({
      data: {
        text: `Agent ${agent.name} has transferred chat to ${user.name} and is now on hold. `,
        role: 'system',
        type: 'notification',
        chatId,
        interactionId: latestInteraction.id,
        time: Date.now(),
      },
    });

    const latestInteractionUpdated =
      await this.interactionsService.findLatestInteractionByChatWithMessages(
        chatId
      );

    // Send system message to frontend clients via websocket
    this.websocketService.sendToClient(agent.workspaceId, 'messageChatUpdate', {
      chat: chatUpdated,
      latestInteraction: latestInteractionUpdated,
      latestMessage: {
        ...systemMessage,
        whatsappTimestamp: systemMessage?.whatsappTimestamp?.toString(),
        time: systemMessage?.time?.toString(),
      },
    });

    return { success: true };
  }

  async sendMessage(chatId: string, { message, media }: SendMessageDto) {
    // Ensure chat exists
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        agent: true,
      },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${chatId} not found`);
    }

    // Find latest interaction
    const latestInteraction = await this.prisma.interaction.findFirst({
      where: { chatId },
      orderBy: { startAt: 'desc' },
      select: {
        id: true,
      },
    });

    // Create new message in the database first
    let newMessage: Message = await this.prisma.message.create({
      data: {
        text: message,
        role: 'human', // From human operator
        chatId,
        type: media?.type || 'text',
        time: Date.now(),
        sentToEvolution: false, // Will be updated after sending
        imageUrl: media?.type === 'image' ? media.url : undefined,
        audioUrl: media?.type === 'audio' ? media.url : undefined,
        documentUrl: media?.type === 'document' ? media.url : undefined,
        interactionId: latestInteraction.id,
      },
    });

    // If this is a WhatsApp chat, send the message via Waha API
    if (chat.whatsappPhone) {
      try {
        this.logger.log(
          `Sending message to WhatsApp number ${chat.whatsappPhone}`
        );

        // Send message via the Wapa API service
        const response = await this.wahaApiService.sendWhatsAppMessage(
          chat.agentId,
          chat.whatsappPhone,
          message,
          media
        );

        // Update the message with the response data
        newMessage = await this.prisma.message.update({
          where: { id: newMessage.id },
          data: {
            sentToEvolution: true,
            sentAt: new Date(),
            whatsappMessageId: response?.id?.id ?? response?.key?.id,
            whatsappStatus: response?.ack?.toString(), // convertido para string, conforme esperado no schema
            whatsappTimestamp: response?.timestamp?.toString(),
            type: response?.type,
            text: response?.body,
            mimetype: response?._data?.mimetype,
            fileName: response?._data?.caption,
          },
        });

        newMessage = await this.prisma.message.update({
          where: { id: newMessage.id },
          data: {
            sentToEvolution: true,
            sentAt: new Date(),
            whatsappMessageId: response?.key?.id, // Store the WhatsApp message ID if available
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to send message to WhatsApp: ${error.message}`
        );

        // Mark the message as failed
        newMessage = await this.prisma.message.update({
          where: { id: newMessage.id },
          data: {
            failedAt: new Date(),
            failReason: error.message,
          },
        });

        throw error;
      }
    } else {
      this.logger.warn(
        `Chat ${chatId} has no WhatsApp phone number, message not sent externally`
      );
    }

    // Update the chat's last message time
    const updatedChat = await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        updatedAt: new Date(),
      },
      select: {
        id: true,
        agentId: true,
        title: true,
        name: true,
        userName: true,
        userPicture: true,
        whatsappPhone: true,
        humanTalk: true,
        read: true,
        finished: true,
        unReadCount: true,
      },
    });

    const latestInteractionUpdated =
      await this.interactionsService.findLatestInteractionByChatWithMessages(
        chat.id
      );

    return {
      chat: updatedChat,
      latestInteraction: latestInteractionUpdated,
      latestMessage: {
        ...newMessage,
        whatsappTimestamp: newMessage?.whatsappTimestamp?.toString(),
        time: newMessage?.time?.toString(),
      },
    };
  }

  // Helper methods to format responses
  private formatChatResponse(chat: any): ChatDto {
    return {
      id: chat.id,
      humanTalk: chat.humanTalk || false,
      userPicture: chat.userPicture || null,
      messageUserName: chat.messageUserName || 'User',
      read: chat.read || false,
      role: chat.role || 'user',
      agentName: chat.agent.name || 'Agent',
      agentId: chat.agentId,
      whatsappPhone: chat.whatsappPhone || '',
      finished: chat.finished || false,
      avatar: chat.avatar || '',
      title: chat.title || '',
      type: chat.type || 'chat',
      userName: chat.userName || 'User',
      userId: chat.userId || '',
      picture: chat.picture || '',
      conversationType: chat.conversationType || 'direct',
      createdAt: chat.createdAt ? chat.createdAt.getTime() : Date.now(),
      name: chat.name || '',
      recipient: chat.recipient || '',
      time: chat.updatedAt ? chat.updatedAt.getTime() : Date.now(),
      unReadCount: chat.unReadCount || 0,
      conversation: chat.conversation || '',
    };
  }

  private formatMessageResponse(message: any): MessageDto {
    return {
      id: message.id,
      userPicture: message.userPicture || null,
      fileName: message.fileName || null,
      role: message.role || 'user',
      documentUrl: message.documentUrl || '',
      type: message.type || 'text',
      userName: message.userName || null,
      midiaContent: message.midiaContent || null,
      userId: message.userId || '',
      audioUrl: message.audioUrl || '',
      imageUrl: message.imageUrl || '',
      width: message.width || 0,
      height: message.height || 0,
      text: message.text || '',
      time: message.time || Date.now(),
    };
  }
}
