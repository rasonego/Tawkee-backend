import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WahaApiService } from '../waha-api/waha-api.service';
import { WebsocketService } from 'src/websocket/websocket.service';

import { PaginationDto } from '../common/dto/pagination.dto';
import { InteractionStatus } from './dto/interaction.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InteractionWithMessagesDto } from './dto/interaction-with-messages.dto';
import { PaginatedInteractionsWithMessagesResponseDto } from './paginated-interactions-with-messages-response.dto';
import { ConversationDto } from 'src/conversations/dto/conversation.dto';
import { ConversationsService } from 'src/conversations/conversations.service';
import { subMinutes } from 'date-fns';

const IDLE_CLOSE_THRESHOLD_MINUTES = 1;
const RESOLVED_IDLE_CLOSE_THRESHOLD_MINUTES = 120;

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaApiService: WahaApiService,
    private readonly websocketService: WebsocketService,
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversationsService: ConversationsService
  ) {}

  async findInteractionsByChatWithMessages(
    chatId: string,
    paginationDto: PaginationDto
  ): Promise<PaginatedInteractionsWithMessagesResponseDto> {
    const { page, pageSize } = paginationDto;
    const skip = (page - 1) * pageSize;

    // Define the where condition for filtering by chatId
    const whereCondition = { chatId: chatId };

    // Get total count of interactions for the specific chat
    const total = await this.prisma.interaction.count({
      where: whereCondition,
    });

    if (total === 0) {
      // Optional: Handle case where chat has no interactions
      // You could throw NotFoundException or return empty paginated result
      // throw new NotFoundException(`No interactions found for chat ID: ${chatId}`);
      return {
        data: [],
        meta: {
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        },
      };
    }

    // Get interactions with pagination and include agent and messages
    const interactions = await this.prisma.interaction.findMany({
      where: whereCondition,
      skip,
      take: pageSize,
      orderBy: { startAt: 'desc' },
      include: {
        agent: {
          select: {
            name: true,
            avatar: true,
          },
        },
        messages: {
          orderBy: {
            createdAt: 'asc', // Order messages chronologically
          },
        },
      },
    });

    // Map Prisma Interaction objects to InteractionWithMessagesDto
    const data: InteractionWithMessagesDto[] = interactions.map(
      (interaction) => ({
        id: interaction.id,
        agentId: interaction.agentId,
        agentName: interaction.agent.name,
        agentAvatar: interaction.agent.avatar || null,
        chatId: interaction.chatId,
        chatName: null, // Chat name is not directly available here unless included
        status: interaction.status as InteractionStatus,
        startAt: interaction.startAt,
        transferAt: interaction.transferAt || null,
        resolvedAt: interaction.resolvedAt || null,
        userId: interaction.userId || null,
        messages: interaction.messages.map(message => ({
          ...message,
          whatsappTimestamp: message.whatsappTimestamp
            ? message.whatsappTimestamp.toString()
            : null,
          time: message.time ? message.time.toString() : null,
        }))
      })
    );

    // Return the paginated result using the new DTO
    return {
      data,
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findLatestInteractionByChatWithMessages(
    chatId: string
  ): Promise<InteractionWithMessagesDto> {
    // Busca a interação mais recente
    const latestInteraction = await this.prisma.interaction.findFirst({
      where: { chatId },
      orderBy: { startAt: 'desc' },
      include: {
        agent: {
          select: {
            name: true,
            avatar: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      id: latestInteraction.id,
      agentId: latestInteraction.agentId,
      agentName: latestInteraction.agent.name,
      agentAvatar: latestInteraction.agent.avatar || null,
      chatId: latestInteraction.chatId,
      chatName: null,
      status: latestInteraction.status as InteractionStatus,
      startAt: latestInteraction.startAt,
      transferAt: latestInteraction.transferAt || null,
      resolvedAt: latestInteraction.resolvedAt || null,
      userId: latestInteraction.userId || null,
      messages: latestInteraction.messages.map((message) => ({
        ...message,
        whatsappTimestamp: message?.whatsappTimestamp?.toString() || null,
        time: message?.time?.toString() || null
      })),
    };
  }

  /**
   * Resolve an interaction (mark as completed)
   * @param interactionId ID of the interaction to resolve
   * @param resolution Optional resolution notes
   * @returns Success status
   */
  async resolveInteraction(
    interactionId: string,
    resolution?: string
  ): Promise<{ success: boolean }> {
    // Find the interaction first
    const interaction = await this.prisma.interaction.findUnique({
      where: { id: interactionId },
    });

    if (!interaction) {
      throw new NotFoundException(
        `Interaction with ID ${interactionId} not found`
      );
    }

    // Check if interaction is already resolved
    if (interaction.status === 'RESOLVED') {
      throw new BadRequestException('Interaction is already resolved');
    }

    // Get the associated chat to send notification
    const chat = await this.prisma.chat.findUnique({
      where: { id: interaction.chatId },
    });

    if (!chat) {
      throw new NotFoundException(
        `Chat with ID ${interaction.chatId} not found`
      );
    }

    // Update the interaction status to RESOLVED
    await this.prisma.interaction.update({
      where: { id: interactionId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date()
      },
    });

    // Prepare notification messages
    const internalResolutionMessage = 'Conversation closed';

    // Add a system message indicating resolution for internal use
    const systemMessage = await this.prisma.message.create({
      data: {
        text: resolution || internalResolutionMessage,
        role: 'system',
        chatId: interaction.chatId,
        interactionId: interaction.id,
        type: 'text',
        time: Date.now(),
      },
    });

    // Mark chat as unread
    this.logger.log(`Updating chat ${chat.id} as unread`);
    const updatedChat = await this.prisma.chat.update({
      where: { id: chat.id },
      data: {
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
        unReadCount: true 
      }
    });

    const latestInteraction =
      await this.findLatestInteractionByChatWithMessages(chat.id);

    const agent = await this.prisma.agent.findFirst({
      where: { id: chat.agentId },
      select: { id: true, workspaceId: true },
    });

    // Send system message to frontend clients via websocket
    this.websocketService.sendToClient(agent.workspaceId, 'messageChatUpdate', {
      chat: updatedChat,
      latestInteraction,
      latestMessage: {
        ...systemMessage,
        whatsappTimestamp: systemMessage.whatsappTimestamp
          ? systemMessage.whatsappTimestamp.toString()
          : null,
        time: systemMessage.time ? systemMessage.time.toString() : null,
      },
    });

    return { success: true };
  }

  @Cron('* * * * *') // every minute
  async handleIdleInteractions() {
    const now = new Date();

    await this.warnIdleRunningInteractions(now);
    await this.closeWarnedIdleRunningInteractions(now);
    await this.closeWaitingIdleInteractions(now);
  }

  private async warnIdleRunningInteractions(now: Date) {
    // Find RUNNING interactions with enabledRemainder set on their agent and no prior warning
    const interactions = await this.prisma.interaction.findMany({
      where: {
        status: 'RUNNING',
        warnedAt: null,
        agent: {
          settings: {
            enabledReminder: true,
          }
        },
      },
      select: {
        id: true,
        chat: {
          select: {
              id: true,
              contextId: true,
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
              updatedAt: true
          }
        },
        agent: {
          select: {
            id: true,
            workspaceId: true,
            settings: {
              select: {
                reminderIntervalMinutes: true
              }
            }
          }
        }
      },
    });

    for (let interaction of interactions) {
      const { chat, agent } = interaction;

      // Skip if remainderIntervalMinutes not defined or invalid
      if (!agent.settings.reminderIntervalMinutes || agent.settings.reminderIntervalMinutes <= 0) continue;

      const idleThreshold = subMinutes(now, agent.settings.reminderIntervalMinutes);

      // Check chat idle time
      if (chat.updatedAt >= idleThreshold) continue;

      const prompt = `
        Given the messages from this ongoing chat between a user and you (AI agent), generate a short and 
        natural-sounding warning message.
        
        The message should be polite and context-aware. It should inform the user that the conversation may
        end soon due to inactivity, and gently encourage them to reply if they still need help.
        Make sure the tone remains helpful and supportive.
        
        Only return the warning message text and never call any intentions.
      `

      const agentResponse = await this.conversationsService.converse(
        agent.id, 
        {
          contextId: chat.contextId,
          prompt,
          chatName: chat.name || chat.userName,
          respondViaAudio: false,
        } as ConversationDto
      );

      const message = await this.prisma.message.create({
        data: {
          text: agentResponse.message,
          role: 'assistant',
          type: 'chat',
          chatId: chat.id,
          interactionId: interaction.id,
          time: Date.now(),
        },
      });

      await this.prisma.interaction.update({
        where: { id: interaction.id },
        data: {
          warnedAt: now,
        },
      });

      if (chat?.whatsappPhone) {
        await this.wahaApiService.sendWhatsAppMessage(
          agent.id,
          chat.whatsappPhone,
          agentResponse.message
        );

        const interactionUpdated = await this.findLatestInteractionByChatWithMessages(chat.id);

        // Send system message to frontend clients via websocket
        this.websocketService.sendToClient(agent.workspaceId, 'messageChatUpdate', {
          chat,
          latestInteraction: interactionUpdated,
          latestMessage: {
            ...message,
            whatsappTimestamp: message?.whatsappTimestamp?.toString(),
            time: message?.time?.toString(),
          },
        });
      }

      this.logger.log(`Sent idle warning to interaction ${interaction.id}`);
    }
  }

  private async closeWarnedIdleRunningInteractions(now: Date) {
    const closeThreshold = subMinutes(now, IDLE_CLOSE_THRESHOLD_MINUTES);

    const interactions = await this.prisma.interaction.findMany({
      where: {
        status: 'RUNNING',
        warnedAt: { not: null, lt: closeThreshold },
        chat: {
          updatedAt: { lt: closeThreshold },
        },
      },
      select: {
        id: true,
        agent: true,
        chat: true,
      }
    });

    for (const interaction of interactions) {
      await this.resolveInteraction(
        interaction.id,
        `Interaction closed due to ${IDLE_CLOSE_THRESHOLD_MINUTES} minutes of inactivity.`
      );
      // const message = await this.prisma.message.create({
      //   data: {
      //     text: `Interaction closed due to ${IDLE_CLOSE_THRESHOLD_MINUTES} minutes of inactivity.`,
      //     role: 'system',
      //     type: 'chat',
      //     chatId: interaction.chat.id,
      //     interactionId: interaction.id,
      //     time: Date.now(),
      //   },
      // });

      // await this.prisma.interaction.update({
      //   where: { id: interaction.id },
      //   data: {
      //     status: 'RESOLVED',
      //     resolvedAt: now,
      //   },
      // });

      // const interactionUpdated = await this.findLatestInteractionByChatWithMessages(interaction.chat.id);

      // // Send system message to frontend clients via websocket
      // this.websocketService.sendToClient(interaction.agent.workspaceId, 'messageChatUpdate', {
      //   chat: interaction.chat,
      //   latestInteraction: interactionUpdated,
      //   latestMessage: {
      //     ...message,
      //     whatsappTimestamp: message?.whatsappTimestamp?.toString(),
      //     time: message?.time?.toString(),
      //   },
      // });

      this.logger.log(`Auto-closed idle warned interaction ${interaction.id}`);
    }
  }

  private async closeWaitingIdleInteractions(now: Date) {
    const resolvedThreshold = subMinutes(now, RESOLVED_IDLE_CLOSE_THRESHOLD_MINUTES);

    const interactions = await this.prisma.interaction.findMany({
      where: {
        status: 'WAITING',
        chat: {
          humanTalk: false,
          updatedAt: { lt: resolvedThreshold },
        },
      },
    });

    for (const interaction of interactions) {
      await this.resolveInteraction(
        interaction.id,
        `Interaction closed due to ${RESOLVED_IDLE_CLOSE_THRESHOLD_MINUTES} minutes of inactivity.`
      );
    }
  } 
}
