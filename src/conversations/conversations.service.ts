import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { DeepseekService } from '../deepseek/deepseek.service';
import { OpenAiService } from '../openai/openai.service';
import { TrainingsService } from '../trainings/trainings.service';
import { ConversationDto } from './dto/conversation.dto';
import { AIModel } from '@prisma/client';
import { getCommunicationGuide } from '../common/utils/communication-guides';

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
    private readonly deepseekAiService: DeepseekService,
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

    // Generate a response from the agent
    const response = await this.generateAgentResponse(
      agent,
      chat,
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
    d: any,
    chat: any,
    conversationDto: ConversationDto
  ) {
    // Extract the agent data from the enhanced DTO
    const agent = d.agent;
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

      // Add additional agent information to be passed to the model
      const enhancedAgent = {
        ...agent,
        settings: d.settings,
        trainings,
        intentions,
        // Ensure job-related attributes are included
        jobName: agent.jobName || '',
        jobSite: agent.jobSite || '',
        jobDescription: agent.jobDescription || '',
      };

      // STEP 1: Check if user message matches any intentions
      const matchedIntention = await this.detectIntention(conversationDto.prompt, intentions);
      
      if (matchedIntention) {
        this.logger.debug(`Matched intention: ${matchedIntention.description}`);
        
        // STEP 2: Extract required fields from user message or ask for missing ones
        const extractionResult = await this.extractIntentionFields(
          conversationDto.prompt, 
          conversationContext,
          matchedIntention,
          enhancedAgent
        );

        if (!extractionResult.allFieldsCollected) {
          // Return a response asking for missing information
          return {
            message: extractionResult.clarificationMessage,
            images: [],
            audios: [],
            communicationGuide,
            goalGuide,
            pendingIntention: {
              intentionId: matchedIntention.id,
              collectedFields: extractionResult.collectedFields,
              missingFields: extractionResult.missingFields
            }
          };
        }

        // STEP 3: Execute the intention if all fields are collected
        try {
          const intentionResult = await this.executeIntention(matchedIntention, extractionResult.collectedFields);
          
          // STEP 4: Generate a natural response based on the intention result
          const communicationGuide = getCommunicationGuide(agent.communicationType);
 
          const responseText = await this.openAiService.generateIntentionSuccessResponse(
            matchedIntention,
            intentionResult,
            enhancedAgent,
            communicationGuide
          );

          return {
            message: responseText,
            images: [],
            audios: [],
            communicationGuide,
            goalGuide,
            intentionExecuted: {
              intention: matchedIntention.description,
              result: intentionResult,
              success: intentionResult.success
            }
          };

        } catch (error) {
          this.logger.error(`Error executing intention: ${error.message}`);

          // Generate error response
          const communicationGuide = getCommunicationGuide(agent.communicationType);
          const errorResponse = await this.openAiService.generateIntentionErrorResponse(
            matchedIntention,
            error,
            enhancedAgent,
            communicationGuide
          );
          
          return {
            message: errorResponse,
            images: [],
            audios: [],
            communicationGuide,
            goalGuide,
            intentionError: {
              intention: matchedIntention.description,
              error: error.message
            }
          };
        }
      }

      // STEP 5: If no intention matched, proceed with normal AI response generation
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

        // Add intention context to the AI prompt
        let intentionContext = '';
        if (intentions.length > 0) {
          intentionContext = '\nAvailable actions I can perform:\n';
          intentions.forEach((intention, index) => {
            intentionContext += `${index + 1}. ${intention.description}\n`;
          });
          intentionContext += '\nIf the user wants me to perform any of these actions, I should let them know I can help with that.\n';
        }

        // Use the preferred model to generate the response with RAG context
        const preferredModel: AIModel = enhancedAgent.settings.preferredModel;
        const openAIModels: AIModel[] = [
          AIModel.GPT_4,
          AIModel.GPT_4_1,
          AIModel.GPT_4_1_MINI,
          AIModel.GPT_4_O,
          AIModel.GPT_4_O_MINI,
          AIModel.OPEN_AI_O1,
          AIModel.OPEN_AI_O3,
          AIModel.OPEN_AI_O3_MINI,
          AIModel.OPEN_AI_O4_MINI
        ];

        if (preferredModel == AIModel.DEEPSEEK_CHAT) {
          responseText = await this.deepseekAiService.generateAgentResponse(
            conversationDto.prompt,
            enhancedAgent,
            communicationGuide,
            goalGuide,
            conversationContext,
            retrievedContext + intentionContext // Include both RAG and intention context
          );
        } else if (openAIModels.includes(preferredModel as AIModel)) {
          responseText = await this.openAiService.generateAgentResponse(
            conversationDto.prompt,
            enhancedAgent,
            communicationGuide,
            goalGuide,
            conversationContext,
            retrievedContext + intentionContext // Include both RAG and intention context
          );          
        }

        this.logger.debug(`Generated AI response for agent ${agent.name}`);
      } catch (error) {
        this.logger.error(`Error generating AI response: ${error.message}`);

        // Fallback response logic (keeping your existing fallback)
        let stylePrefix = '';
        let goalPrefix = '';

        switch (agent.communicationType) {
          case 'FORMAL':
            stylePrefix = 'Greetings. I am';
            break;
          case 'RELAXED':
            stylePrefix = "Hey there! I'm";
            break;
          default:
            stylePrefix = "Hi, I'm";
            break;
        }

        switch (agentType) {
          case 'SUPPORT':
            goalPrefix = "I'm here to help resolve your issue with";
            break;
          case 'SALE':
            goalPrefix = "I'd like to tell you about our fantastic solution for";
            break;
          case 'PERSONAL':
            goalPrefix = "I'd love to chat with you about";
            break;
          default:
            goalPrefix = "I'm here to assist you with";
            break;
        }

        responseText = `${stylePrefix} ${agent.name}. ${goalPrefix} "${conversationDto.prompt}". I'm currently experiencing some technical difficulties, but I'll do my best to assist you.`;
      }

      // Return the response in the expected format
      return {
        message: responseText,
        images: [],
        audios: [],
        communicationGuide,
        goalGuide,
      };
    } catch (error) {
      this.logger.error(`Error in generateAgentResponse: ${error.message}`);
      throw error;
    }
  }

  private async detectIntention(userMessage: string, intentions: any[]): Promise<any | null> {
    if (!intentions || intentions.length === 0) {
      return null;
    }

    // Simple keyword-based intention detection
    // You can make this more sophisticated using ML models or semantic similarity
    const lowerMessage = userMessage.toLowerCase();
    
    for (const intention of intentions) {
      const keywords = this.extractKeywordsFromIntention(intention);
      const score = this.calculateIntentionScore(lowerMessage, keywords);
      
      if (score > 0.3) { // Threshold for intention matching
        return intention;
      }
    }
    
    return null;
  }

  private extractKeywordsFromIntention(intention: any): string[] {
    const keywords = [];
    
    // Extract keywords from description
    const descWords = intention.description.toLowerCase().split(/\s+/);
    keywords.push(...descWords);
    
    // Extract keywords from field names and descriptions
    if (intention.fields) {
      intention.fields.forEach(field => {
        keywords.push(...field.name.toLowerCase().split(/\s+/));
        keywords.push(...field.description.toLowerCase().split(/\s+/));
      });
    }
    
    // Add common action words based on intention type
    if (intention.description.includes('schedule') || intention.description.includes('meeting')) {
      keywords.push('schedule', 'meeting', 'appointment', 'book', 'calendar');
    }
    
    return keywords.filter(word => word.length > 2); // Filter out short words
  }

  private calculateIntentionScore(message: string, keywords: string[]): number {
    const messageWords = message.split(/\s+/);
    let matches = 0;
    
    keywords.forEach(keyword => {
      if (message.includes(keyword)) {
        matches++;
      }
    });
    
    return matches / Math.max(keywords.length, messageWords.length);
  }

  private async extractIntentionFields(
    userMessage: string, 
    conversationContext: string,
    intention: any,
    agent: any
  ): Promise<{
    allFieldsCollected: boolean;
    collectedFields: Record<string, any>;
    missingFields: string[];
    clarificationMessage?: string;
  }> {
    const collectedFields: Record<string, any> = {};
    const missingFields: string[] = [];
    
    // Use AI to extract field values from the user message
    try {
      const extractionPrompt = this.buildExtractionPrompt(userMessage, conversationContext, intention);
      
      // Always use OpenAI for field extraction (more reliable for structured data)
      const extractionResult = await this.openAiService.extractFields(extractionPrompt);
      
      // Parse the extraction result (assuming JSON format)
      const parsedFields = JSON.parse(extractionResult);
      
      // Check which fields were successfully extracted
      intention.fields.forEach(field => {
        if (parsedFields[field.jsonName] && parsedFields[field.jsonName] !== null && parsedFields[field.jsonName] !== '') {
          collectedFields[field.jsonName] = parsedFields[field.jsonName];
        } else if (field.required) {
          missingFields.push(field.name);
        }
      });
      
    } catch (error) {
      this.logger.error(`Error extracting fields: ${error.message}`);
      // If extraction fails, mark all required fields as missing
      intention.fields.forEach(field => {
        if (field.required) {
          missingFields.push(field.name);
        }
      });
    }
    
    if (missingFields.length > 0) {
      const communicationGuide = getCommunicationGuide(agent.communicationType);
      const clarificationMessage = await this.openAiService.generateClarificationMessage(
        intention, 
        missingFields, 
        collectedFields,
        agent,
        communicationGuide
      );
      
      return {
        allFieldsCollected: false,
        collectedFields,
        missingFields,
        clarificationMessage
      };
    }
    
    return {
      allFieldsCollected: true,
      collectedFields,
      missingFields: []
    };
  }

  private buildExtractionPrompt(userMessage: string, context: string, intention: any): string {
    let prompt = `Extract the following information from the user's message:\n\n`;
    prompt += `User message: "${userMessage}"\n`;
    prompt += `Context: ${context}\n\n`;
    prompt += `Fields to extract:\n`;
    
    intention.fields.forEach(field => {
      prompt += `- ${field.name} (${field.jsonName}): ${field.description} - Type: ${field.type}, Required: ${field.required}\n`;
    });
    
    prompt += `\nReturn the extracted information as a JSON object with the field jsonNames as keys. Use null for fields that cannot be determined from the message.\n`;
    prompt += `Example: {"meetingTitle": "Team Standup", "startDateTime": "2024-01-15T10:00:00", "attendeeEmail": null}\n\n`;
    prompt += `JSON Response:`;
    
    return prompt;
  }

  private async generateClarificationMessage(
    intention: any, 
    missingFields: string[], 
    collectedFields: Record<string, any>,
    agent: any
  ): Promise<string> {
    // This method is kept for backward compatibility but now uses AI service
    const { getCommunicationGuide } = await import('../common/utils/communication-guides');
    const communicationGuide = getCommunicationGuide(agent.communicationType);
    
    return await this.openAiService.generateClarificationMessage(
      intention,
      missingFields,
      collectedFields,
      agent,
      communicationGuide
    );
  }

  private async executeIntention(intention: any, fields: Record<string, any>): Promise<any> {
    try {
      // Build the request
      const url = intention.url;
      const method = intention.httpMethod.toUpperCase();
      
      // Replace template variables in URL
      let finalUrl = url;
      Object.keys(fields).forEach(fieldKey => {
        finalUrl = finalUrl.replace(`{{${fieldKey}}}`, encodeURIComponent(fields[fieldKey]));
      });
      
      // Build headers
      const headers: Record<string, string> = {};
      intention.headers.forEach(header => {
        let value = header.value;
        // Replace template variables in headers
        Object.keys(fields).forEach(fieldKey => {
          value = value.replace(`{{${fieldKey}}}`, fields[fieldKey]);
        });
        headers[header.name] = value;
      });
      
      // Build request body if present
      let body = null;
      if (intention.requestBody) {
        let bodyString = intention.requestBody;
        Object.keys(fields).forEach(fieldKey => {
          bodyString = bodyString.replace(`{{${fieldKey}}}`, fields[fieldKey]);
        });
        body = bodyString;
      }
      
      // Make the HTTP request
      const response = await fetch(finalUrl, {
        method,
        headers,
        body: body ? body : undefined
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      return {
        success: true,
        data: result,
        statusCode: response.status
      };
      
    } catch (error) {
      this.logger.error(`Intention execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
        statusCode: error.status || 500
      };
    }
  }
}
