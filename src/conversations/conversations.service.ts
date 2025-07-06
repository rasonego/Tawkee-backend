import { Injectable, BadRequestException, Logger } from '@nestjs/common';

import * as Handlebars from 'handlebars';
import * as vm from 'vm';
import { DateTime } from 'luxon';

import { PrismaService } from '../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';
import { DeepseekService } from '../deepseek/deepseek.service';
import { OpenAiService } from '../openai/openai.service';
import { TrainingsService } from '../trainings/trainings.service';
import { ConversationDto } from './dto/conversation.dto';
import { AIModel, ScheduleSettings } from '@prisma/client';
import { getCommunicationGuide } from '../common/utils/communication-guides';
import { GoogleCalendarOAuthService } from 'src/intentions/google-calendar/google-calendar-oauth.service';
import { ChatCompletionTool } from 'openai/resources';
import { IntentionDto } from 'src/intentions/dto/intention.dto';
import { ScheduleValidationService } from 'src/intentions/google-calendar/schedule-validation/schedule-validation.service';
import { plainToInstance } from 'class-transformer';
import { AvailableTimesDto } from 'src/intentions/google-calendar/schedule-validation/dto/schedule-validation.dto';
import { ChatDto } from 'src/chats/dto/chat.dto';
import { ElevenLabsService } from 'src/elevenlabs/elevenlabs.service';
import { createStartHumanAttendanceIntention } from 'src/agents/transfer-to-human-intention';
import { ChatsService } from 'src/chats/chats.service';

const timezoneMap: Record<string, string> = {
  '(GMT-12:00) Baker Island': 'Etc/GMT+12',
  '(GMT-11:00) Pago Pago': 'Pacific/Pago_Pago',
  '(GMT-10:00) Honolulu': 'Pacific/Honolulu',
  '(GMT-09:00) Anchorage': 'America/Anchorage',
  '(GMT-08:00) Los Angeles': 'America/Los_Angeles',
  '(GMT-07:00) Denver': 'America/Denver',
  '(GMT-06:00) Chicago': 'America/Chicago',
  '(GMT-05:00) New York': 'America/New_York',
  '(GMT-04:00) Santiago': 'America/Santiago',
  '(GMT-03:00) São Paulo': 'America/Sao_Paulo',
  '(GMT-02:00) South Georgia': 'Atlantic/South_Georgia',
  '(GMT-01:00) Azores': 'Atlantic/Azores',
  '(GMT+00:00) London': 'Europe/London',
  '(GMT+01:00) Paris': 'Europe/Paris',
  '(GMT+02:00) Athens': 'Europe/Athens',
  '(GMT+03:00) Moscow': 'Europe/Moscow',
  '(GMT+04:00) Dubai': 'Asia/Dubai',
  '(GMT+05:00) Karachi': 'Asia/Karachi',
  '(GMT+06:00) Almaty': 'Asia/Almaty',
  '(GMT+07:00) Bangkok': 'Asia/Bangkok',
  '(GMT+08:00) Beijing': 'Asia/Shanghai',
  '(GMT+09:00) Tokyo': 'Asia/Tokyo',
  '(GMT+10:00) Sydney': 'Australia/Sydney',
  '(GMT+11:00) Noumea': 'Pacific/Noumea',
  '(GMT+12:00) Auckland': 'Pacific/Auckland',
};

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly agentsService: AgentsService,
    private readonly deepseekAiService: DeepseekService,
    private readonly openAiService: OpenAiService,
    private readonly trainingsService: TrainingsService,
    private readonly googleCalendarOAuthService: GoogleCalendarOAuthService,
    private readonly scheduleValidationService: ScheduleValidationService,
    private readonly elevenLabsService: ElevenLabsService,
    private readonly chatService: ChatsService
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
        status: { not: 'RESOLVED' },
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

  async generateAgentResponse(
    d: { agent: any; settings: any },
    chat: any,
    conversationDto: ConversationDto
  ) {
    const agent = d.agent;
    const settings = d.settings;
    try {
      const { getGoalGuide } = await import('../common/utils/goal-guides');

      const communicationGuide = getCommunicationGuide(agent.communicationType);
      const agentType = agent.type || 'SUPPORT';
      const goalGuide = getGoalGuide(agentType);

      this.logger.debug(`Agent ${agent.name} [ID: ${agent.id}]`);
      this.logger.debug(`Communication type: ${agent.communicationType}`);
      this.logger.debug(`Agent type: ${agentType}`);
      this.logger.debug(`Intentions count: ${agent.intentions?.length || 0}`);

      const conversationHistory = await this.prisma.message.findMany({
        where: {
          chatId: chat.id,
          NOT: {
            text: conversationDto.prompt,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const orderedHistory = [...conversationHistory].reverse();
      let conversationContext = '';
      if (orderedHistory.length > 0) {
        conversationContext = 'Previous messages in this conversation:\n';
        orderedHistory.forEach((msg) => {
          conversationContext += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}\n`;
        });
      }

      const trainings = agent.trainings || [];
      let intentions = agent.intentions || [];

      if (settings?.enabledHumanTransfer) {
        intentions = [...intentions, createStartHumanAttendanceIntention(this.chatService)];
      }

      const enhancedAgent = {
        ...agent,
        settings,
        trainings,
        intentions,
        jobName: agent.jobName || '',
        jobSite: agent.jobSite || '',
        jobDescription: agent.jobDescription || '',
      };

      this.logger.debug(
        `Analyzing message for matching intentions: "${conversationDto.prompt}"`
      );
      const detectionResult = await this.detectIntention(
        conversationDto.prompt,
        intentions,
        enhancedAgent.model,
        chat,
        orderedHistory.map((msg) => ({
          role: msg.role,
          text: msg.text,
          createdAt: msg.createdAt.toISOString(),
        })),
        agent.settings
      );

      const scheduleSettings = await this.prisma.scheduleSettings.findUnique({
        where: { agentId: enhancedAgent.id },
      });

      let responseText = '';
      const audios: any[] = [];

      if (detectionResult) {
        const { matchedIntention, extractedFields, toolCallMessage } =
          detectionResult;

        if (!matchedIntention && toolCallMessage) {
          this.logger.debug(
            '[generateAgentResponse] OpenAI returned assistant message instead of tool call. Returning it directly.'
          );
          responseText = toolCallMessage;
        } else {
          const collectedFields = extractedFields || {};
          const missingFields = matchedIntention.fields
            .filter((f) => f.required && !collectedFields[f.jsonName])
            .map((f) => f.name);

          if (missingFields.length > 0) {
            responseText =
              await this.openAiService.generateClarificationMessage(
                matchedIntention,
                missingFields,
                collectedFields,
                enhancedAgent,
                communicationGuide,
                goalGuide,
                chat.userName,
                conversationDto.prompt,
                scheduleSettings
              );
            return {
              message: responseText,
              images: [],
              audios: [],
              communicationGuide,
              goalGuide,
              pendingIntention: {
                intentionId: matchedIntention.id,
                collectedFields,
                missingFields,
              },
            };
          }

          const timezone = timezoneMap[enhancedAgent.settings.timezone];

          try {
            this.logger.debug(
              `Executing intention: ${matchedIntention.description} with timezone ${timezone}`
            );

            let intentionResult;
            if (matchedIntention.toolName === 'schedule_google_meeting') {
              intentionResult = await this.executeScheduleMeetingIntention(
                intentions,
                matchedIntention,
                collectedFields,
                agent.id,
                scheduleSettings,
                timezone
              );
            } else {
              intentionResult = await this.executeIntention(
                matchedIntention,
                collectedFields,
                agent.id,
                timezone
              );
            }

            responseText =
              await this.openAiService.generateIntentionSuccessResponse(
                matchedIntention,
                intentionResult,
                enhancedAgent,
                communicationGuide,
                goalGuide,
                chat.userName,
                conversationDto.prompt,
                scheduleSettings
              );

            // Intention executed, now check for audio response
            if (conversationDto.respondViaAudio && responseText) {
              try {
                const audioData = await this.elevenLabsService.textToAudio(
                  enhancedAgent.id,
                  { text: responseText }
                );
                if (audioData) {
                  audios.push(audioData); // Add the audio data (Buffer) to the audios array
                }
              } catch (audioError) {
                this.logger.error(
                  `Error generating audio for intention response: ${audioError.message}`
                );
              }
            }

            console.log({intentionResult});

            return {
              message: responseText,
              images: [],
              audios: audios, // Return the generated audios
              communicationGuide,
              goalGuide,
              intentionExecuted: {
                intention: matchedIntention.description,
                result: intentionResult,
                success: intentionResult.success,
              },
            };
          } catch (error) {
            this.logger.error(`Error executing intention: ${error.message}`);

            responseText =
              await this.openAiService.generateIntentionErrorResponse(
                matchedIntention,
                error,
                enhancedAgent,
                communicationGuide,
                goalGuide,
                chat.userName,
                conversationDto.prompt,
                scheduleSettings
              );

            // Intention error, now check for audio response
            if (conversationDto.respondViaAudio && responseText) {
              try {
                const audioData = await this.elevenLabsService.textToAudio(
                  enhancedAgent.id,
                  { text: responseText }
                );
                if (audioData) {
                  audios.push(audioData);
                }
              } catch (audioError) {
                this.logger.error(
                  `Error generating audio for intention error response: ${audioError.message}`
                );
              }
            }

            return {
              message: responseText,
              images: [],
              audios: audios, // Return the generated audios
              communicationGuide,
              goalGuide,
              intentionError: {
                intention: matchedIntention.description,
                error: error.message,
              },
            };
          }
        }
      }

      this.logger.debug(
        `No matching intention found. Proceeding with fallback AI response.`
      );

      // STEP 5: If no intention matched, proceed with normal AI response generation
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
          intentionContext +=
            '\nIf the user wants me to perform any of these actions, I should let them know I can help with that.\n';
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
          AIModel.OPEN_AI_O4_MINI,
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

        responseText = `${stylePrefix} ${agent.name}. ${goalPrefix} "${conversationDto.prompt}". I'm currently experiencing some technical difficulties, but I'll do my best to assist you.`;
      }

      // After generating responseText (either from intention or fallback AI), check if audio response is needed
      if (conversationDto.respondViaAudio && responseText) {
        try {
          const audioData = await this.elevenLabsService.textToAudio(
            enhancedAgent.id,
            { text: responseText }
          );
          if (audioData) {
            audios.push(audioData);
          }
        } catch (audioError) {
          this.logger.error(
            `Error generating audio for AI response: ${audioError.message}`
          );
        }
      }

      // Return the response in the expected format
      return {
        message: responseText,
        images: [],
        audios: audios,
        communicationGuide,
        goalGuide,
      };
    } catch (error) {
      this.logger.error(`Error in generateAgentResponse: ${error.message}`);
      throw error;
    }
  }

  async detectIntention(
    userPrompt: string,
    intentions: IntentionDto[],
    model: AIModel,
    chat: ChatDto,
    conversationHistory?: { role: string; text: string; createdAt: string }[],
    agentSettings?: { timezone?: string }
  ): Promise<{
    matchedIntention?: IntentionDto;
    extractedFields?: Record<string, any>;
    toolCallMessage?: string;
  }> {
    const tools = this.mapIntentionsToTools(intentions);

    const latestTimestamp = conversationHistory?.length
      ? conversationHistory[conversationHistory.length - 1]?.createdAt
      : new Date().toISOString();

    const formattedHistory =
      conversationHistory
        ?.map(
          (msg) => `${msg.role === 'user' ? 'user' : 'assistant'}: ${msg.text}`
        )
        .join('\n') || '';

    const timezoneNote = agentSettings?.timezone
      ? `The timezone reference is always ${agentSettings.timezone}. Interpret all ambiguous time expressions accordingly.`
      : '';

    const prompt = `
  The following conversation occurred with the latest user message sent at ${latestTimestamp}.
  Please interpret all date/time expressions (e.g., "today", "8 am", "next week") in this context.

  Additionally:
  - If possible, infer any relevant fields such as contactName, contactPhone, or scheduling details from the conversation context.
  - If a field is not clearly stated, try to use common sense or recent messages to deduce values.
      - Common sense: If no conversation history provided, and user requests to schedule meetings or check availability, consider they are referring to today.
  - Do not ask for technical values like requestId unless essential.
  - Do not ask for user's timezones. ALWAYS use the Agent's timezone.

  Chat data: ${JSON.stringify(chat, null, 3)}

  Conversation history:
  ${formattedHistory}

  Now the user says:
  [${chat?.whatsappPhone || ''} - ${chat?.userName || ''}]: ${userPrompt}

  Finally:
  ${timezoneNote}

    `.trim();

    const { toolCall, extractedFields, fallbackMessage } =
      await this.openAiService.callWithToolDetection(prompt, tools, model);

    if (!toolCall && fallbackMessage) {
      return {
        matchedIntention: null,
        extractedFields: null,
        toolCallMessage: fallbackMessage,
      };
    }

    if (!toolCall) return null;

    // const enrichedFields = {
    //   ...extractedFields,
    //   contactPhone: extractedFields?.contactPhone ?? chat.whatsappPhone ?? undefined,
    //   q: extractedFields?.contactPhone ?? chat.whatsappPhone ?? undefined,
    //   contactName: extractedFields?.contactName ?? chat.userName ?? undefined,
    // };

    const matchedIntention = intentions.find(
      (i) => i.toolName === toolCall.function.name
    );

    if (!matchedIntention) {
      return null;
    }

    // if (
    //   matchedIntention.type === 'LOCAL' &&
    //   typeof matchedIntention.localHandler === 'function'
    // ) {
    //   try {
    //     await matchedIntention.localHandler(extractedFields || {});
    //   } catch (error) {
    //     this.logger.error(
    //       `[detectIntention] Error executing localHandler for intention ${matchedIntention.toolName}: ${error.message}`
    //     );
    //     return {
    //       matchedIntention,
    //       extractedFields,
    //       toolCallMessage: `Erro ao executar ação local: ${error.message}`,
    //     };
    //   }
    // }

    return {
      matchedIntention,
      extractedFields,
    };
  }

  private mapIntentionsToTools(
    intentions: IntentionDto[]
  ): ChatCompletionTool[] {
    return intentions
      .filter((intention) => {
        const hasToolName =
          typeof intention.toolName === 'string' &&
          intention.toolName.trim().length > 0;
        const hasFields = Array.isArray(intention.fields);

        if (!hasToolName || !hasFields) {
          this.logger.warn(
            `[mapIntentionsToTools] Skipping invalid intention:`,
            {
              id: intention.id,
              toolName: intention.toolName,
              // fieldsType: typeof intention.fields,
            }
          );
        }

        return hasToolName && hasFields;
      })
      .map((intention) => {
        const parameters: any = {
          type: 'object',
          properties: {},
          required: [],
        };

        for (const field of intention.fields) {
          if (!field.jsonName || typeof field.jsonName !== 'string') {
            this.logger.warn(
              `[mapIntentionsToTools] Skipping field with invalid jsonName: ${JSON.stringify(field)}`
            );
            continue;
          }

          const jsonType = this.convertFieldTypeToJsonSchema(field.type);
          parameters.properties[field.jsonName] = {
            type: jsonType,
            description: field.description || '',
          };

          if (field.required) {
            parameters.required.push(field.jsonName);
          }
        }

        const toolSchema: ChatCompletionTool = {
          type: 'function',
          function: {
            name: intention.toolName.trim(),
            description: intention.description || 'No description provided.',
            parameters,
          },
        };

        // this.logger.debug(`[mapIntentionsToTools] Built tool schema for "${toolSchema.function.name}": ${JSON.stringify(toolSchema, null, 2)}`);

        return toolSchema;
      });
  }

  private convertFieldTypeToJsonSchema(type: string): string {
    const normalized = type.trim().toUpperCase();

    const typeMap: Record<string, string> = {
      TEXT: 'string',
      URL: 'string',
      DATE: 'string',
      DATETIME: 'string',
      DATE_TIME: 'string',
      NUMBER: 'number',
      BOOLEAN: 'boolean',
    };

    return typeMap[normalized] || 'string';
  }

  private renderTemplate(
    template: string,
    context: Record<string, any>
  ): string {
    const compiled = Handlebars.compile(template, { noEscape: true });
    return compiled(context);
  }

  private normalizeFields(fields: Record<string, any>): Record<string, any> {
    const normalized = { ...fields };

    for (const [key, value] of Object.entries(normalized)) {
      if (typeof value === 'string') {
        const trimmed = value.trim();

        if (trimmed === 'true') normalized[key] = true;
        else if (trimmed === 'false') normalized[key] = false;
        else if (
          trimmed.includes(',') &&
          !trimmed.startsWith('[') &&
          !trimmed.startsWith('{')
        ) {
          normalized[key] = trimmed.split(',').map((item) => item.trim());
        }
      }
    }

    return normalized;
  }

  private async executeIntention(
    intention: IntentionDto,
    inputFields: Record<string, any>,
    agentId: string,
    agentTimezone?: string
  ): Promise<any> {
    try {
      this.logger.debug(
        `[executeIntention] Starting execution for intention: ${intention.description}`
      );

      // Normaliza campos
      const fields = this.normalizeFields(inputFields);

      if (intention.type === 'LOCAL') {
        // Execução local — executa a função diretamente
        if (typeof intention.localHandler !== 'function') {
          throw new Error(`localHandler is not defined or not a function`);
        }

        const result = await intention.localHandler(fields);
        return result;
      }

      if (intention.type === 'WEBHOOK') {
        // Fluxo atual de chamada via HTTP para intenções webhook

        const accessToken =
          await this.googleCalendarOAuthService.getValidAccessToken(agentId);
        this.logger.debug(`[executeIntention] Access token retrieved`);

        const timezone = agentTimezone || 'UTC';

        // ... aqui vai todo o seu código atual que monta URL, headers, corpo, etc ...

        // Ajuste a formatação dos campos de data/hora conforme timezone
        const toISOStringWithTZ = (dt: string, tz: string): string => {
          return DateTime.fromISO(dt, { zone: tz })
            .toUTC()
            .toISO({ suppressMilliseconds: true });
        };

        const appendOffsetToTimeString = (
          input: string,
          timezone: string
        ): string => {
          const dt = DateTime.fromISO(input, { zone: timezone });
          return dt.toISO({ includeOffset: true, suppressMilliseconds: true });
        };

        ['startDateTime', 'endDateTime', 'startSearch', 'endSearch'].forEach(
          (key) => {
            if (fields[key])
              fields[key] = toISOStringWithTZ(fields[key], timezone);
          }
        );
        ['timeMin', 'timeMax'].forEach((key) => {
          if (fields[key])
            fields[key] = appendOffsetToTimeString(fields[key], timezone);
        });

        fields.timeZone = timezone;

        this.logger.debug(`[executeIntention] Fields: ${fields}`);

        // Precondições e chamadas HTTP conforme seu código...

        // (Mantenha o resto do código do fetch aqui)

        // -- código omitido para não repetir --

        // Retorno final da chamada HTTP
        // return { success: true, data: parsedResponse, statusCode: response.status };

      }

      throw new Error(
        `Unsupported intention type: ${intention.type}. Only 'LOCAL' or 'WEBHOOK' supported.`
      );
    } catch (error) {
      this.logger.error(
        `[executeIntention] Intention execution failed: ${error.message}`,
        error.stack || ''
      );
      throw error;
    }
  }


  private resolveTemplate(
    template: string,
    fields: Record<string, any>
  ): string {
    return template.replace(/{{(.*?)}}/g, (_, key) => {
      const value = fields[key.trim()];
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  async executeScheduleMeetingIntention(
    intentions: IntentionDto[],
    intention: IntentionDto,
    fields: Record<string, any>,
    agentId: string,
    scheduleSettings: ScheduleSettings,
    agentTimezone?: string
  ): Promise<any> {
    if (!scheduleSettings) throw new Error('Schedule settings not configured.');

    const tz = agentTimezone || 'UTC';
    const start = DateTime.fromISO(fields.startDateTime, { zone: tz });
    const end = DateTime.fromISO(fields.endDateTime, { zone: tz });

    this.logger.debug(
      `[executeScheduleMeetingIntention] Start: ${start} End: ${end}`
    );

    // Transform the JSON field to the proper DTO class
    const transformedSettings = {
      ...scheduleSettings,
      availableTimes: scheduleSettings.availableTimes
        ? plainToInstance(AvailableTimesDto, scheduleSettings.availableTimes)
        : undefined,
    };

    const validationError = this.scheduleValidationService.validateSchedule(
      start,
      end,
      transformedSettings
    );

    if (validationError) {
      throw new Error(validationError);
    }

    try {
      return await this.executeIntention(intention, fields, agentId, tz);
    } catch (error) {
      if (error.message.includes('unavailable')) {
        // Check availability using Google Calendar FreeBusy API (replace with actual logic)
        const now = DateTime.now().setZone(tz);
        fields.startSearch = fields.startSearch || now.toUTC().toISO();
        fields.endSearch =
          fields.endSearch || now.plus({ days: 7 }).toUTC().toISO();

        const suggestAvailableSlotsIntention = intentions.find(
          (i) => i.toolName === 'suggest_available_google_meeting_slots'
        );
        const response = await this.executeIntention(
          suggestAvailableSlotsIntention,
          fields,
          agentId,
          tz
        );
        throw new Error(JSON.stringify(response, null, 3));
      } else {
        throw new Error(error);
      }
    }
  }
}
