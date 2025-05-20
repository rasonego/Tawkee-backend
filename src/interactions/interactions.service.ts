import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationDto } from '../common/dto/pagination.dto';
import { InteractionDto, InteractionStatus } from './dto/interaction.dto';
import { InteractionMessageDto } from './dto/interaction-message.dto';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import { EvolutionApiService } from '../evolution-api/evolution-api.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evolutionApiService: EvolutionApiService
  ) {}

  /**
   * Scheduled task to automatically process idle interactions
   * Runs every 5 minutes to check for interactions that need warnings or closure
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async processIdleInteractionsTask() {
    this.logger.log('Running scheduled idle interactions processor...');

    try {
      // Default idle times: warn after 30 minutes of inactivity, close after 5 more minutes
      const result = await this.processIdleInteractions(30, 5);

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

  async findAllByWorkspace(
    workspaceId: string,
    paginationDto: PaginationDto,
    agentId?: string
  ): Promise<PaginatedResult<InteractionDto>> {
    const { page, pageSize, query } = paginationDto;
    const skip = (page - 1) * pageSize;

    // Build where condition based on parameters
    const where: any = { workspace: { id: workspaceId } };

    // Add agent filter if provided
    if (agentId) {
      where.agentId = agentId;
    }

    // Add search query if provided
    if (query) {
      where.OR = [
        { agent: { name: { contains: query, mode: 'insensitive' } } },
        { chat: { name: { contains: query, mode: 'insensitive' } } },
      ];
    }

    // Get total count
    const total = await this.prisma.interaction.count({ where });

    // Get interactions with pagination
    const interactions = await this.prisma.interaction.findMany({
      where,
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
        chat: {
          select: {
            name: true,
          },
        },
      },
    });

    // Map to DTOs
    const data = interactions.map((interaction) => ({
      id: interaction.id,
      agentId: interaction.agentId,
      agentName: interaction.agent.name,
      agentAvatar: interaction.agent.avatar || null,
      chatId: interaction.chatId,
      chatName: interaction.chat?.name || null,
      status: interaction.status as InteractionStatus,
      startAt: interaction.startAt,
      transferAt: interaction.transferAt || null,
      resolvedAt: interaction.resolvedAt || null,
      userId: interaction.userId || null,
    }));

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

  async findMessagesById(
    interactionId: string
  ): Promise<InteractionMessageDto[]> {
    // First verify the interaction exists
    const interaction = await this.prisma.interaction.findUnique({
      where: { id: interactionId },
    });

    if (!interaction) {
      throw new NotFoundException(
        `Interaction with ID ${interactionId} not found`
      );
    }

    // Get all messages for this interaction
    const messages = await this.prisma.message.findMany({
      where: { interactionId },
      orderBy: { createdAt: 'asc' },
    });

    // Map to DTOs
    return messages.map((message) => ({
      id: message.id,
      text: message.text || null,
      role: message.role,
      userName: message.userName || null,
      userId: null, // No userId in the schema
      userPicture: message.userPicture || null,
      time:
        Number(message.time) || Math.floor(message.createdAt.getTime() / 1000), // Use existing time or convert createdAt
      type: message.type || 'text',
      imageUrl: message.imageUrl || null,
      audioUrl: message.audioUrl || null,
      documentUrl: message.documentUrl || null,
      fileName: message.fileName || null,
      midiaContent: message.midiaContent || null,
      width: message.width || null,
      height: message.height || null,
    }));
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
    let internalResolutionMessage = 'Conversation closed';
    let userNotificationMessage =
      'This conversation has been closed. Thank you for your time.';

    if (resolution) {
      internalResolutionMessage = `Resolution: ${resolution}`;
      // Only include resolution in user message if it's not sensitive
      if (
        !resolution.toLowerCase().includes('internal') &&
        !resolution.toLowerCase().includes('private') &&
        !resolution.toLowerCase().includes('sensitive')
      ) {
        userNotificationMessage = `This conversation has been closed: ${resolution}. Thank you for your time.`;
      }
    }

    // Add a system message indicating resolution for internal use
    await this.prisma.message.create({
      data: {
        text: internalResolutionMessage,
        role: 'system',
        chatId: interaction.chatId,
        interactionId: interaction.id,
        type: 'text',
        time: Date.now(),
      },
    });

    // Add a notification message for the user and send it via external channel when available
    if (chat) {
      // Create the message in the database
      const newMessage = await this.prisma.message.create({
        data: {
          text: userNotificationMessage,
          role: 'assistant',
          chatId: interaction.chatId,
          interactionId: interaction.id,
          type: 'text',
          time: Date.now(),
          sentToEvolution: false,
        },
      });

      // Send via WhatsApp if available
      if (chat.whatsappPhone) {
        try {
          this.logger.log(
            `Sending resolution message to WhatsApp number ${chat.whatsappPhone}`
          );

          const response = await this.evolutionApiService.sendWhatsAppMessage(
            chat.agentId,
            chat.whatsappPhone,
            userNotificationMessage
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
            `Resolution message sent successfully to ${chat.whatsappPhone}`
          );
        } catch (error) {
          this.logger.error(
            `Failed to send resolution message: ${error.message}`,
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

        const response = await this.evolutionApiService.sendWhatsAppMessage(
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

    // Set the interaction to WAITING status and record the transfer time
    await this.prisma.interaction.update({
      where: { id: interactionId },
      data: {
        status: 'WAITING',
        transferAt: new Date(), // Record when it was moved to WAITING state
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
    runningIdleMinutes: number = 30,
    waitingIdleMinutes: number = 5
  ): Promise<{
    warningNeeded: { id: string; chatId: string }[];
    closureNeeded: { id: string; chatId: string }[];
  }> {
    const now = new Date();

    // Calculate cutoff times
    const runningIdleCutoff = new Date(
      now.getTime() - runningIdleMinutes * 60 * 1000
    );
    const waitingIdleCutoff = new Date(
      now.getTime() - waitingIdleMinutes * 60 * 1000
    );

    // Use a transaction to ensure consistent results
    const result = await this.prisma.$transaction(async (tx) => {
      // Find WAITING interactions that need to be closed
      // Since there's no updatedAt field in the model, we'll rely on transferAt
      // which indicates when the interaction was set to WAITING status
      const waitingInteractions = await tx.interaction.findMany({
        where: {
          status: 'WAITING',
          transferAt: {
            lt: waitingIdleCutoff,
          },
        },
        select: {
          id: true,
          chatId: true,
        },
      });

      // Find RUNNING interactions with their chats and the most recent message
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

      // Filter running interactions to find those that need warnings
      const warningNeeded = runningInteractions
        .filter((interaction) => {
          // If no messages or the most recent message is older than the cutoff
          const messages = interaction.chat?.messages || [];
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

      return {
        warningNeeded,
        closureNeeded: waitingInteractions,
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
    waitingIdleMinutes: number = 5
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

              const response =
                await this.evolutionApiService.sendWhatsAppMessage(
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
