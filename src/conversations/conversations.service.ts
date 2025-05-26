import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { OpenAiService } from '../openai/openai.service';
import { TrainingsService } from '../trainings/trainings.service';
import { ConversationDto } from './dto/conversation.dto';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
    private readonly openAiService: OpenAiService,
    private readonly trainingsService: TrainingsService
  ) {}

  async converse(agentId: string, conversationDto: ConversationDto) {
    // Ensure agent exists
    const agent = await this.agentsService.findOne(agentId);

    // Check if the agent is active
    if (agent.agent.isActive === false) {
      throw new BadRequestException(
        'Agent is inactive and cannot process messages'
      );
    }

    // Validate required fields
    if (!conversationDto.contextId || !conversationDto.prompt) {
      throw new BadRequestException('contextId and prompt are required');
    }

    // Find existing chat or create a new one
    let chat = await this.prisma.chat.findUnique({
      where: { contextId: conversationDto.contextId },
    });

    if (!chat) {
      // Create a new chat
      chat = await this.prisma.chat.create({
        data: {
          contextId: conversationDto.contextId,
          name: conversationDto.chatName,
          userPicture: conversationDto.chatPicture,
          whatsappPhone: conversationDto.phone,
          workspaceId: agent.agent.workspaceId,
          agentId,
        },
      });
    }

    // Create a user message
    const userMessage = await this.prisma.message.create({
      data: {
        text: conversationDto.prompt,
        role: 'user',
        userName: conversationDto.chatName,
        userPicture: conversationDto.chatPicture,
        chatId: chat.id,
      },
    });

    // Create or find an interaction
    let interaction = await this.prisma.interaction.findFirst({
      where: {
        chatId: chat.id,
        status: 'RUNNING',
      },
    });

    if (!interaction) {
      interaction = await this.prisma.interaction.create({
        data: {
          workspaceId: agent.agent.workspaceId,
          agentId,
          chatId: chat.id,
          status: 'RUNNING',
        },
      });
    }

    // Link the message to the interaction
    await this.prisma.message.update({
      where: { id: userMessage.id },
      data: { interactionId: interaction.id },
    });

    // Generate a response from the agent
    const response = await this.generateAgentResponse(
      agent,
      chat,
      interaction,
      conversationDto
    );

    // Send response asynchronously if callback URL provided
    if (conversationDto.callbackUrl) {
      // Implement async response handling here
      // For now, just return the response
      return response;
    }

    return response;
  }

  async addMessage(
    agentId: string,
    data: { contextId: string; prompt: string; role?: string }
  ) {
    // Ensure agent exists
    const agent = await this.agentsService.findOne(agentId);

    // Check if the agent is active
    if (agent.agent.isActive === false) {
      throw new BadRequestException(
        'Agent is inactive and cannot process messages'
      );
    }

    // Validate required fields
    if (!data.contextId || !data.prompt) {
      throw new BadRequestException('contextId and prompt are required');
    }

    // Find existing chat
    const chat = await this.prisma.chat.findUnique({
      where: { contextId: data.contextId },
    });

    if (!chat) {
      throw new BadRequestException(
        `Chat with contextId ${data.contextId} not found`
      );
    }

    // Find the running interaction
    const interaction = await this.prisma.interaction.findFirst({
      where: {
        chatId: chat.id,
        status: 'RUNNING',
      },
    });

    if (!interaction) {
      throw new BadRequestException(
        `No running interaction found for chat ${data.contextId}`
      );
    }

    // Create the message
    const role = data.role || 'assistant';
    await this.prisma.message.create({
      data: {
        text: data.prompt,
        role,
        chatId: chat.id,
        interactionId: interaction.id,
      },
    });

    // For simplicity, return a success response
    return {
      message: `Message added as ${role}`,
      images: [],
      audios: [],
    };
  }

  private async generateAgentResponse(
    enhancedAgentDto: any,
    chat: any,
    interaction: any,
    conversationDto: ConversationDto
  ) {
    // Extract the agent data from the enhanced DTO
    const agent = enhancedAgentDto.agent;
    try {
      // Import the communication guide and goal guide utilities
      const { getCommunicationGuide } = await import(
        '../common/utils/communication-guides'
      );
      const { getGoalGuide } = await import('../common/utils/goal-guides');

      // Retrieve agent settings and training data
      // Get communication guide based on agent's communicationType
      const communicationGuide = getCommunicationGuide(agent.communicationType);

      // Get goal guide based on agent's type (SUPPORT, SALE, PERSONAL)
      // Default to SUPPORT if not specified
      const agentType = agent.type || 'SUPPORT';
      const goalGuide = getGoalGuide(agentType);

      // Log the communication type, agent type, and guides for debugging
      this.logger.debug(
        `Agent ${agent.name} uses communication type: ${agent.communicationType}`
      );
      this.logger.debug(`Agent ${agent.name} is of type: ${agentType}`);
      this.logger.debug(
        `Using communication guide: ${communicationGuide.substring(0, 50)}...`
      );
      this.logger.debug(`Using goal guide: ${goalGuide.substring(0, 50)}...`);

      // Fetch conversation history for context (last 10 messages)
      const conversationHistory = await this.prisma.message.findMany({
        where: { chatId: chat.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      // Reverse to get chronological order
      const orderedHistory = [...conversationHistory].reverse();

      // Create a conversation context string for the AI
      let conversationContext = '';
      if (orderedHistory.length > 0) {
        conversationContext = 'Previous messages in this conversation:\n';
        orderedHistory.forEach((msg) => {
          conversationContext += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}\n`;
        });
      }

      // Get trainings and intentions data if available
      const trainings = agent.trainings || [];
      const intentions = agent.intentions || [];

      // Add additional agent information to be passed to OpenAI
      const enhancedAgent = {
        ...agent,
        settings: enhancedAgentDto.settings,
        trainings,
        intentions,
        // Ensure job-related attributes are included
        jobName: agent.jobName || '',
        jobSite: agent.jobSite || '',
        jobDescription: agent.jobDescription || '',
      };

      // Generate AI response using OpenAI with RAG
      let responseText = '';
      try {
        // Search for relevant training materials using RAG
        let retrievedContext = '';
        try {
          const relevantTrainings =
            await this.trainingsService.searchRelevantTrainings(
              agent.id,
              conversationDto.prompt,
              3 // Limit to top 3 most relevant trainings
            );

          if (relevantTrainings.length > 0) {
            this.logger.debug(
              `Found ${relevantTrainings.length} relevant trainings for agent ${agent.name}`
            );

            // Format the relevant trainings for inclusion in the prompt
            retrievedContext = 'Relevant knowledge from training materials:\n';
            relevantTrainings.forEach((training, index) => {
              retrievedContext += `\n[${index + 1}] ${training.text}\n`;
            });
          } else {
            this.logger.debug(
              `No relevant trainings found for query: ${conversationDto.prompt.substring(0, 50)}...`
            );
          }
        } catch (error) {
          this.logger.error(
            `Error retrieving relevant trainings: ${error.message}`
          );
          // Continue without RAG if there's an error
        }

        // Use OpenAI to generate the response with RAG context
        responseText = await this.openAiService.generateAgentResponse(
          conversationDto.prompt,
          enhancedAgent,
          communicationGuide,
          goalGuide,
          conversationContext,
          retrievedContext // Include retrieved context from RAG
        );

        this.logger.debug(`Generated AI response for agent ${agent.name}`);
      } catch (error) {
        this.logger.error(`Error generating AI response: ${error.message}`);

        // Fallback response if OpenAI fails
        let stylePrefix = '';
        let goalPrefix = '';

        // Determine style prefix based on communication type
        switch (agent.communicationType) {
          case 'FORMAL':
            stylePrefix = 'Greetings. I am';
            break;
          case 'RELAXED':
            stylePrefix = "Hey there! I'm";
            break;
          default: // NORMAL or any other case
            stylePrefix = "Hi, I'm";
            break;
        }

        // Determine goal prefix based on agent type
        switch (agentType) {
          case 'SUPPORT':
            goalPrefix = "I'm here to help resolve your issue with";
            break;
          case 'SALE':
            goalPrefix =
              "I'd like to tell you about our fantastic solution for";
            break;
          case 'PERSONAL':
            goalPrefix = "I'd love to chat with you about";
            break;
          default:
            goalPrefix = "I'm here to assist you with";
            break;
        }

        // Fallback response
        responseText = `${stylePrefix} ${agent.name}. ${goalPrefix} "${conversationDto.prompt}". I'm currently experiencing some technical difficulties, but I'll do my best to assist you.`;
      }

      // Create an assistant message
      await this.prisma.message.create({
        data: {
          text: responseText,
          role: 'assistant',
          chatId: chat.id,
          interactionId: interaction.id,
        },
      });

      // Return the response in the expected format
      return {
        message: responseText,
        images: [],
        audios: [],
        communicationGuide, // Include the communication guide for reference
        goalGuide, // Include the goal guide for reference
      };
    } catch (error) {
      this.logger.error(`Error in generateAgentResponse: ${error.message}`);
      throw error;
    }
  }
}
