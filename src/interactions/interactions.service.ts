import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WahaApiService } from '../waha-api/waha-api.service';
import { WebsocketService } from 'src/websocket/websocket.service';

import { PaginationDto } from '../common/dto/pagination.dto';
import { InteractionStatus } from './dto/interaction.dto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InteractionWithMessagesDto } from './dto/interaction-with-messages.dto';
import { PaginatedInteractionsWithMessagesResponseDto } from './paginated-interactions-with-messages-response.dto';

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wahaApiService: WahaApiService,
    private readonly websocketService: WebsocketService
  ) {}

  /**
   * Scheduled task to automatically process idle interactions
   * Runs every 5 minutes to check for interactions that need warnings or closure
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processIdleInteractionsTask() {
    this.logger.log('Running scheduled idle interactions processor...');

    try {
      // Default idle times: warn after 30 minutes of inactivity, close after 10 more minutes
      const result = await this.processIdleInteractions(30, 10);

      this.logger.log(
        `Scheduled task completed: ${result.warned} interactions warned, ${result.closed} interactions closed`
      );
    } catch (error) {
      this.logger.error(
        `Error in scheduled idle interactions processor: ${error.message}`,
        error.stack
      );
    }
  }

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
      orderBy: { startAt: 'asc' }, // Or any other order you prefer
      include: {
        agent: {
          select: {
            name: true,
            avatar: true,
          },
        },
        messages: {
          // Include messages related to the interaction
          select: {
            id: true,
            text: true,
            role: true,
            userName: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc', // Order messages chronologically
          },
        },
        // No need to include chat again as we are filtering by chatId
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
        // Map Prisma Message objects to MessageDto
        messages: interaction.messages.map((message) => ({
          id: message.id,
          text: message.text ?? null, // Handle potential null text
          role: message.role,
          userName: message.userName ?? null, // Handle potential null userName
          createdAt: message.createdAt,
        })),
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
  ): Promise<PaginatedInteractionsWithMessagesResponseDto> {
    // Conta total de interações para esse chat
    const total = await this.prisma.interaction.count({
      where: { chatId },
    });

    if (total === 0) {
      return {
        data: [],
        meta: {
          total: 0,
          page: 1,
          pageSize: 1,
          totalPages: 0,
        },
      };
    }

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
          select: {
            id: true,
            text: true,
            role: true,
            userName: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const data: InteractionWithMessagesDto[] = latestInteraction
      ? [
          {
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
              id: message.id,
              text: message.text ?? null,
              role: message.role,
              userName: message.userName ?? null,
              createdAt: message.createdAt,
            })),
          },
        ]
      : [];

    return {
      data,
      meta: {
        total,
        page: 1,
        pageSize: 1,
        totalPages: Math.ceil(total / 1),
      },
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
        resolvedAt: new Date(),
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
    await this.prisma.chat.update({
      where: { id: chat.id },
      data: {
        read: false,
        unReadCount: { increment: 1 },
      },
    });

    // Fetch latest data to send to socket clients
    const updatedChat = await this.prisma.chat.findUnique({
      where: { id: chat.id },
    });

    const paginatedInteractions =
      await this.findLatestInteractionByChatWithMessages(chat.id);

    const agent = await this.prisma.agent.findFirst({
      where: { id: chat.id },
      select: { workspaceId: true },
    });

    // Send system message to frontend clients via websocket
    this.websocketService.sendToClient(agent.workspaceId, 'messageChatUpdate', {
      ...updatedChat,
      paginatedInteractions: paginatedInteractions,
      latestMessage: {
        ...systemMessage,
        whatsappTimestamp: systemMessage?.whatsappTimestamp.toString(),
        time: systemMessage?.time.toString(),
      },
    });

    return { success: true };
  }

  /**
   * Send a warning message and set interaction to WAITING status
   * This is used for idle interactions that will be closed soon
   * @param interactionId ID of the interaction to warn
   * @param warningMessage Warning message to send to the user
   * @returns Success status
   */
  async warnBeforeClosing(
    interactionId: string,
    warningMessage: string = 'This conversation has been inactive. It will be closed soon if there is no further response.'
  ): Promise<{ success: boolean }> {
    // Find the interaction
    const interaction = await this.prisma.interaction.findUnique({
      where: { id: interactionId },
    });

    if (!interaction) {
      throw new NotFoundException(
        `Interaction with ID ${interactionId} not found`
      );
    }

    if (interaction.status !== 'RUNNING') {
      throw new BadRequestException(
        `Cannot warn an interaction with status: ${interaction.status}`
      );
    }

    // Get the associated chat
    const chat = await this.prisma.chat.findUnique({
      where: { id: interaction.chatId },
    });

    if (!chat) {
      throw new NotFoundException(
        `Chat with ID ${interaction.chatId} not found`
      );
    }

    // TODO fetch a natural language message from AI warning user instead of an automatic one.
    // warningMessage will be personal and spoken in the context of the current interaction.

    // Add the warning message to the database first
    const newMessage = await this.prisma.message.create({
      data: {
        text: warningMessage,
        role: 'assistant',
        chatId: interaction.chatId,
        interactionId: interaction.id,
        type: 'text',
        time: Date.now(),
        sentToEvolution: false, // Will be updated after sending
      },
    });

    // Send the warning message via WhatsApp if a phone number is available
    if (chat.whatsappPhone) {
      try {
        this.logger.log(
          `Sending warning message to WhatsApp number ${chat.whatsappPhone}`
        );

        const response = await this.wahaApiService.sendWhatsAppMessage(
          chat.agentId,
          chat.whatsappPhone,
          warningMessage
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

        this.logger.log(
          `Warning message sent successfully to ${chat.whatsappPhone}`
        );
      } catch (error) {
        this.logger.error(
          `Failed to send warning message to external channel: ${error.message}`,
          error.stack
        );

        // Mark the message as failed but continue with state update
        await this.prisma.message.update({
          where: { id: newMessage.id },
          data: {
            failedAt: new Date(),
            failReason: error.message,
          },
        });
      }
    }

    // Mark chat as unread
    this.logger.log(`Updating chat ${chat.id} as unread`);
    await this.prisma.chat.update({
      where: { id: chat.id },
      data: {
        read: false,
        unReadCount: { increment: 1 },
      },
    });

    // Fetch latest data to send to socket clients
    const updatedChat = await this.prisma.chat.findUnique({
      where: { id: chat.id },
    });

    const paginatedInteractions =
      await this.findLatestInteractionByChatWithMessages(chat.id);

    const agent = await this.prisma.agent.findFirst({
      where: { id: chat.id },
      select: { workspaceId: true },
    });

    // Send system message to frontend clients via websocket
    this.websocketService.sendToClient(agent.workspaceId, 'messageChatUpdate', {
      ...updatedChat,
      paginatedInteractions: paginatedInteractions,
      latestMessage: {
        ...newMessage,
        whatsappTimestamp: newMessage?.whatsappTimestamp.toString(),
        time: newMessage?.time.toString(),
      },
    });

    return { success: true };
  }

  /**
   * Find idle interactions that need warnings or auto-closure
   * @param runningIdleMinutes Minutes of inactivity for RUNNING interactions
   * @param waitingIdleMinutes Minutes of inactivity for WAITING interactions
   * @returns Lists of interactions that need warnings and closures
   */
  async findIdleInteractions(
    waitingIdleMinutes: number = 10,
    runningIdleMinutes: number = 30,
    warningGracePeriodSeconds: number = 10
  ): Promise<{
    warningNeeded: { id: string; chatId: string }[];
    closureNeeded: { id: string; chatId: string }[];
  }> {
    const now = new Date();

    // Calculate cutoff times
    const waitingIdleCutoff = new Date(
      now.getTime() - waitingIdleMinutes * 60 * 1000
    );
    const runningIdleCutoff = new Date(
      now.getTime() - runningIdleMinutes * 60 * 1000
    );

    const result = await this.prisma.$transaction(async (tx) => {
      // Find WAITING interactions that need warnings
      // These are chats where the agent responded but client hasn't replied
      const waitingForWarning = await tx.interaction.findMany({
        where: {
          status: 'WAITING',
          transferAt: {
            lt: waitingIdleCutoff,
          },
        },
        select: {
          id: true,
          chatId: true,
          transferAt: true,
        },
      });

      // Find interactions that need to be closed
      // Use a separate query to find WAITING interactions that were "warned"
      // (by checking if transferAt is older than grace period + idle time)
      const totalWaitTime = new Date(
        now.getTime() -
          (waitingIdleMinutes * 60 + warningGracePeriodSeconds) * 1000
      );

      const waitingForClosure = await tx.interaction.findMany({
        where: {
          status: 'WAITING',
          transferAt: {
            lt: totalWaitTime, // Been waiting longer than idle time + grace period
          },
        },
        select: {
          id: true,
          chatId: true,
        },
      });

      // Find RUNNING interactions that have been idle too long
      // These should be closed immediately (no warning needed for running state)
      const runningInteractions = await tx.interaction.findMany({
        where: {
          status: 'RUNNING',
        },
        select: {
          id: true,
          chatId: true,
          chat: {
            select: {
              messages: {
                orderBy: {
                  createdAt: 'desc',
                },
                take: 1,
                select: {
                  createdAt: true,
                },
              },
            },
          },
        },
      });

      // Filter running interactions based on most recent message time
      const runningForClosure = runningInteractions
        .filter((interaction) => {
          const messages = interaction.chat?.messages || [];
          // Close if no messages or most recent message is older than cutoff
          return (
            messages.length === 0 ||
            (messages[0]?.createdAt &&
              messages[0].createdAt < runningIdleCutoff)
          );
        })
        .map((interaction) => ({
          id: interaction.id,
          chatId: interaction.chatId,
        }));

      // Separate warning needed vs closure needed
      const warningNeeded = waitingForWarning
        .filter(
          (interaction) =>
            // Only warn interactions that haven't exceeded the total wait time yet
            interaction.transferAt >= totalWaitTime
        )
        .map((interaction) => ({
          id: interaction.id,
          chatId: interaction.chatId,
        }));

      const closureNeeded = [...waitingForClosure, ...runningForClosure];

      return {
        warningNeeded,
        closureNeeded,
      };
    });

    return result;
  }

  /**
   * Process idle interactions - warn those that need warnings and close those that need closures
   * @param runningIdleMinutes Minutes of inactivity for RUNNING interactions
   * @param waitingIdleMinutes Minutes of inactivity for WAITING interactions
   * @returns Stats about the processed interactions
   */
  async processIdleInteractions(
    runningIdleMinutes: number = 30,
    waitingIdleMinutes: number = 10
  ): Promise<{
    warned: number;
    closed: number;
  }> {
    const { warningNeeded, closureNeeded } = await this.findIdleInteractions(
      runningIdleMinutes,
      waitingIdleMinutes
    );

    let warned = 0;
    let closed = 0;

    // Process warnings
    for (const interaction of warningNeeded) {
      try {
        await this.warnBeforeClosing(
          interaction.id,
          `This conversation has been inactive for ${runningIdleMinutes} minutes. If there's no response in the next ${waitingIdleMinutes} minutes, it will be automatically closed.`
        );
        warned++;
      } catch (error) {
        // Log the error but continue processing other interactions
        console.error(`Error warning interaction ${interaction.id}:`, error);
      }
    }

    // Process closures
    for (const interaction of closureNeeded) {
      try {
        await this.resolveInteraction(
          interaction.id,
          `Automatically closed due to ${runningIdleMinutes + waitingIdleMinutes} minutes of inactivity`
        );

        // Get chat info to send a closure message to the user
        const chat = await this.prisma.chat.findUnique({
          where: { id: interaction.chatId },
        });

        if (chat) {
          const closureMessage = `This conversation has been automatically closed due to inactivity. Feel free to start a new conversation if you need further assistance.`;

          // First create the message in the database
          const newMessage = await this.prisma.message.create({
            data: {
              text: closureMessage,
              role: 'assistant',
              chatId: interaction.chatId,
              interactionId: interaction.id,
              type: 'text',
              time: Date.now(),
              sentToEvolution: false,
            },
          });

          // Now send it to the external channel if applicable
          if (chat.whatsappPhone) {
            try {
              this.logger.log(
                `Sending auto-closure message to WhatsApp number ${chat.whatsappPhone}`
              );

              const response = await this.wahaApiService.sendWhatsAppMessage(
                chat.agentId,
                chat.whatsappPhone,
                closureMessage
              );

              // Update the message with the response data
              await this.prisma.message.update({
                where: { id: newMessage.id },
                data: {
                  sentToEvolution: true,
                  sentAt: new Date(),
                  whatsappMessageId: response?.key?.id,
                },
              });

              this.logger.log(
                `Auto-closure message sent successfully to ${chat.whatsappPhone}`
              );
            } catch (error) {
              this.logger.error(
                `Failed to send auto-closure message: ${error.message}`,
                error.stack
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
          }
        }

        closed++;
      } catch (error) {
        // Log the error but continue processing other interactions
        this.logger.error(
          `Error closing interaction ${interaction.id}:`,
          error
        );
      }
    }

    return { warned, closed };
  }
}
