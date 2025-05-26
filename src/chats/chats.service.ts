import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { ChatDto } from './dto/chat.dto';
import { MessageDto } from './dto/message.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { EvolutionApiService } from '../evolution-api/evolution-api.service';

@Injectable()
export class ChatsService {
  private readonly logger = new Logger(ChatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolutionApiService: EvolutionApiService
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
      orderBy: { createdAt: 'desc' },
    });

    // Format the response to match the expected structure
    const formattedChats = chats.map((chat) => this.formatChatResponse(chat));

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

  async startHumanAttendance(chatId: string): Promise<{ success: boolean }> {
    // Ensure chat exists
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { agent: true },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${chatId} not found`);
    }

    // Update chat to indicate human attendance
    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        humanTalk: true,
        updatedAt: new Date(),
      },
    });

    // Create a new message indicating the start of human attendance
    await this.prisma.message.create({
      data: {
        text: 'A human agent has joined the conversation.',
        role: 'system',
        type: 'notification',
        chatId,
        time: Date.now(),
      },
    });

    // If this is a WhatsApp chat, notify the user about the human agent
    if (chat.whatsappPhone) {
      try {
        this.logger.log(
          `Notifying WhatsApp user ${chat.whatsappPhone} about human agent`
        );

        await this.evolutionApiService.sendWhatsAppMessage(
          chat.agentId,
          chat.whatsappPhone,
          'You are now connected with a human support agent.'
        );
      } catch (error) {
        this.logger.error(
          `Failed to send human attendance notification: ${error.message}`
        );
      }
    }

    // Update the interaction status
    try {
      const interaction = await this.prisma.interaction.findFirst({
        where: { chatId },
        orderBy: { startAt: 'desc' },
      });

      if (interaction) {
        await this.prisma.interaction.update({
          where: { id: interaction.id },
          data: { status: 'WAITING' }, // Set to waiting as a human is handling it
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to update interaction status: ${error.message}`
      );
    }

    return { success: true };
  }

  async stopHumanAttendance(chatId: string): Promise<{ success: boolean }> {
    // Ensure chat exists
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId },
      include: { agent: true },
    });

    if (!chat) {
      throw new NotFoundException(`Chat with ID ${chatId} not found`);
    }

    // Update chat to stop human attendance
    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        humanTalk: false,
        updatedAt: new Date(),
      },
    });

    // Create a system message indicating the end of human attendance
    await this.prisma.message.create({
      data: {
        text: 'The human agent has left the conversation. The AI assistant is now handling your requests.',
        role: 'system',
        type: 'notification',
        chatId,
        time: Date.now(),
      },
    });

    // If this is a WhatsApp chat, notify the user
    if (chat.whatsappPhone) {
      try {
        this.logger.log(
          `Notifying WhatsApp user ${chat.whatsappPhone} about AI handover`
        );

        await this.evolutionApiService.sendWhatsAppMessage(
          chat.agentId,
          chat.whatsappPhone,
          'The human agent has left. You are now connected with the AI assistant again.'
        );
      } catch (error) {
        this.logger.error(
          `Failed to send AI handover notification: ${error.message}`
        );
      }
    }

    // Update the interaction status
    try {
      const interaction = await this.prisma.interaction.findFirst({
        where: { chatId },
        orderBy: { startAt: 'desc' },
      });

      if (interaction) {
        await this.prisma.interaction.update({
          where: { id: interaction.id },
          data: {
            status: 'RUNNING',
            resolvedAt: new Date(),
          },
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to update interaction status: ${error.message}`
      );
    }

    return { success: true };
  }

  async sendMessage(
    chatId: string,
    { message, media }: SendMessageDto
  ): Promise<{ success: boolean }> {
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

    // Create new message in the database first
    const newMessage = await this.prisma.message.create({
      data: {
        text: message,
        role: 'human', // From human operator
        chatId,
        type: 'text',
        time: Date.now(),
        sentToEvolution: false, // Will be updated after sending
      },
    });

    // If this is a WhatsApp chat, send the message via Evolution API
    if (chat.whatsappPhone) {
      try {
        this.logger.log(
          `Sending message to WhatsApp number ${chat.whatsappPhone}`
        );

        // Send message via the Evolution API service
        const response = await this.evolutionApiService.sendWhatsAppMessage(
          chat.agentId,
          chat.whatsappPhone,
          message,
          media
        );

        // Update the message with the response data
        await this.prisma.message.update({
          where: { id: newMessage.id },
          data: {
            sentToEvolution: true,
            sentAt: new Date(),
            whatsappMessageId: response?.key?.id, // Store the WhatsApp message ID if available
          },
        });

        this.logger.log(`Message sent successfully to ${chat.whatsappPhone}`);
      } catch (error) {
        this.logger.error(
          `Failed to send message to WhatsApp: ${error.message}`
        );

        // Mark the message as failed
        await this.prisma.message.update({
          where: { id: newMessage.id },
          data: {
            failedAt: new Date(),
            failReason: error.message,
          },
        });
      }
    } else {
      this.logger.warn(
        `Chat ${chatId} has no WhatsApp phone number, message not sent externally`
      );
    }

    // Update the chat's last message time
    await this.prisma.chat.update({
      where: { id: chatId },
      data: {
        updatedAt: new Date(),
      },
    });

    return { success: true };
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
      agentName: chat.agentName || 'Agent',
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
