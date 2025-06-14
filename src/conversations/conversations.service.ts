import { Injectable, BadRequestException, Logger } from '@nestjs/common';

import * as Handlebars from 'handlebars';
import * as vm from 'vm';

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
    private readonly elevenLabsService: ElevenLabsService
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

  async generateAgentResponse(
    d: { agent: any; settings: any },
    chat: any,
    conversationDto: ConversationDto,
  ) {
    const agent = d.agent;
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
      const intentions = agent.intentions || [];

      const enhancedAgent = {
        ...agent,
        settings: d.settings,
        trainings,
        intentions,
        jobName: agent.jobName || '',
        jobSite: agent.jobSite || '',
        jobDescription: agent.jobDescription || '',
      };

      this.logger.debug(`Analyzing message for matching intentions: "${conversationDto.prompt}"`);
      const detectionResult = await this.detectIntention(
        conversationDto.prompt,
        intentions,
        enhancedAgent.model,
        chat,
        orderedHistory.map((msg => ({
          role: msg.role,
          text: msg.text,
          createdAt: msg.createdAt.toISOString()
        }))),
        agent.settings
      );

      const scheduleSettings = await this.prisma.scheduleSettings.findUnique(
        { where: { agentId: enhancedAgent.id } }
      );

      let responseText = '';
      let audios: any[] = [];

      if (detectionResult) {
        const { matchedIntention, extractedFields, toolCallMessage } = detectionResult;

        if (!matchedIntention && toolCallMessage) {
          this.logger.debug('[generateAgentResponse] OpenAI returned assistant message instead of tool call. Returning it directly.');
          responseText = toolCallMessage;
        } else {
          const collectedFields = extractedFields || {};
          const missingFields = matchedIntention.fields
            .filter(f => f.required && !collectedFields[f.jsonName])
            .map(f => f.name);

          if (missingFields.length > 0) {
            responseText = await this.openAiService.generateClarificationMessage(
              matchedIntention,
              missingFields,
              collectedFields,
              enhancedAgent,
              communicationGuide,
              chat,
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
                missingFields
              }
            };
          }

          try {
            this.logger.debug(`Executing intention: ${matchedIntention.description} with timezone ${enhancedAgent.settings}`);
            
            let intentionResult;
            if (matchedIntention.toolName === 'schedule_google_meeting') {
              intentionResult = await this.executeScheduleMeetingIntention(
                intentions, matchedIntention, collectedFields, agent.id, scheduleSettings, enhancedAgent.settings.timezone
              );
            } else {
              intentionResult = await this.executeIntention(
                matchedIntention, collectedFields, agent.id, enhancedAgent.settings.timezone
              );
            }

            responseText = await this.openAiService.generateIntentionSuccessResponse(
              matchedIntention,
              intentionResult,
              enhancedAgent,
              communicationGuide,
              chat,
              scheduleSettings
            );

            // Intention executed, now check for audio response
            if (conversationDto.respondViaAudio && responseText) {
              try {
                const audioData = await this.elevenLabsService.textToAudio(
                  enhancedAgent.id, { text: responseText }
                );
                if (audioData) {
                  audios.push(audioData); // Add the audio data (Buffer) to the audios array
                }
              } catch (audioError) {
                this.logger.error(`Error generating audio for intention response: ${audioError.message}`);
              }
            }

            return {
              message: responseText,
              images: [],
              audios: audios, // Return the generated audios
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

            responseText = await this.openAiService.generateIntentionErrorResponse(
              matchedIntention,
              error,
              enhancedAgent,
              communicationGuide,
              chat,
              scheduleSettings
            );

            // Intention error, now check for audio response
            if (conversationDto.respondViaAudio && responseText) {
              try {
                const audioData = await this.elevenLabsService.textToAudio(
                  enhancedAgent.id, { text: responseText }
                );
                if (audioData) {
                  audios.push(audioData);
                }
              } catch (audioError) {
                this.logger.error(`Error generating audio for intention error response: ${audioError.message}`);
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
                error: error.message
              }
            };
          }
        }
      }

      this.logger.debug(`No matching intention found. Proceeding with fallback AI response.`);

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

      // After generating responseText (either from intention or fallback AI), check if audio response is needed
      if (conversationDto.respondViaAudio && responseText) {
        try {
          const audioData = await this.elevenLabsService.textToAudio(
            enhancedAgent.id, { text: responseText }
          );
          if (audioData) {
            audios.push(audioData);
          }
        } catch (audioError) {
          this.logger.error(`Error generating audio for AI response: ${audioError.message}`);
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
    conversationHistory?: { role: string, text: string, createdAt: string }[],
    agentSettings?: { timezone?: string },
  ): Promise<{
    matchedIntention?: IntentionDto;
    extractedFields?: Record<string, any>;
    toolCallMessage?: string;
  }> {
    const tools = this.mapIntentionsToTools(intentions);

    const latestTimestamp = conversationHistory?.length
    ? conversationHistory[conversationHistory.length - 1]?.createdAt
    : new Date().toISOString();

    const formattedHistory = conversationHistory?.map(msg =>
      `${msg.role === 'user' ? 'user' : 'assistant'}: ${msg.text}`).join('\n') || '';

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

    const { toolCall, extractedFields, fallbackMessage } = await this.openAiService.callWithToolDetection(
      prompt,
      tools,
      model
    );

    if (!toolCall && fallbackMessage) {
      return {
        matchedIntention: null,
        extractedFields: null,
        toolCallMessage: fallbackMessage
      }
    }

    if (!toolCall) return null;

    // const enrichedFields = {
    //   ...extractedFields,
    //   contactPhone: extractedFields?.contactPhone ?? chat.whatsappPhone ?? undefined,
    //   q: extractedFields?.contactPhone ?? chat.whatsappPhone ?? undefined,
    //   contactName: extractedFields?.contactName ?? chat.userName ?? undefined,
    // };

    const matchedTool = intentions.find(i => i.toolName === toolCall.function.name);
    return {
      matchedIntention: matchedTool,
      extractedFields: extractedFields,
    };
  }

  private mapIntentionsToTools(intentions: IntentionDto[]): ChatCompletionTool[] {
    return intentions.filter((intention) => {
      const hasToolName = typeof intention.toolName === 'string' && intention.toolName.trim().length > 0;
      const hasFields = Array.isArray(intention.fields);

      if (!hasToolName || !hasFields) {
        this.logger.warn(`[mapIntentionsToTools] Skipping invalid intention:`, {
          id: intention.id,
          toolName: intention.toolName,
          // fieldsType: typeof intention.fields,
        });
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
          this.logger.warn(`[mapIntentionsToTools] Skipping field with invalid jsonName: ${JSON.stringify(field)}`);
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

  private renderTemplate(template: string, context: Record<string, any>): string {
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
        else if (trimmed.includes(',') && !trimmed.startsWith('[') && !trimmed.startsWith('{')) {
          normalized[key] = trimmed.split(',').map(item => item.trim());
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
      this.logger.debug(`[executeIntention] Starting execution for intention: ${intention.description}`);

      const fields = this.normalizeFields(inputFields);
      const accessToken = await this.googleCalendarOAuthService.getValidAccessToken(agentId);
      this.logger.debug(`[executeIntention] Access token retrieved`);

      let timezone = 'UTC';
      if (agentTimezone && timezoneMap[agentTimezone]) {
        timezone = timezoneMap[agentTimezone];
      }

      const toISOStringWithTZ = (dt: string): string => {
        const date = new Date(dt);
        const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
        return tzDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
      };

      const appendOffsetToTimeString = (input: string, timezone: string): string => {
        const date = input.endsWith('Z') ? new Date(input) : new Date(input + 'Z');
        const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
        const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));

        const offsetMinutes = (tzDate.getTime() - utcDate.getTime()) / 60000;
        const offsetSign = offsetMinutes >= 0 ? '+' : '-';
        const absOffset = Math.abs(offsetMinutes);
        const offsetHours = String(Math.floor(absOffset / 60)).padStart(2, '0');
        const offsetMins = String(absOffset % 60).padStart(2, '0');
        const offset = `${offsetSign}${offsetHours}:${offsetMins}`;

        const base = input.replace(/Z$/, '');
        return `${base}${offset}`;
      };

      ['startDateTime', 'endDateTime', 'startSearch', 'endSearch'].forEach(key => {
        if (fields[key]) fields[key] = toISOStringWithTZ(fields[key]);
      });
      ['timeMin', 'timeMax'].forEach(key => {
        if (fields[key]) fields[key] = appendOffsetToTimeString(fields[key], timezone);
      });

      fields.timeZone = timezone;
      const preconditionResults: Record<string, any>[] = [];

      if (Array.isArray(intention.preconditions)) {
        for (const [index, pre] of intention.preconditions.entries()) {
          let finalPreUrl = this.resolveTemplate(pre.url, fields);

          if (Array.isArray(pre.queryParams)) {
            const searchParams = new URLSearchParams();
            for (const param of pre.queryParams) {
              const value = this.resolveTemplate(param.value, fields);
              searchParams.append(param.name, value);
            }
            finalPreUrl += `${finalPreUrl.includes('?') ? '&' : '?'}${searchParams.toString()}`;
          }

          const preHeaders: Record<string, string> = {};
          pre.headers?.forEach(h => {
            let value = h.value.replace('{{DYNAMIC_GOOGLE_ACCESS_TOKEN}}', accessToken);
            Object.keys(fields).forEach(k => value = value.replace(`{{${k}}}`, fields[k]));
            preHeaders[h.name] = value;
          });

          let preBody: string | undefined;
          if (pre.requestBody) {
            const rendered = this.renderTemplate(pre.requestBody, fields);
            try {
              preBody = JSON.stringify(JSON.parse(rendered));
            } catch (err) {
              this.logger.warn(`[executeIntention] Invalid precondition body`, { rawTemplate: pre.requestBody, rendered, fields, error: err.message });
              throw new Error('Invalid precondition request body format');
            }
          }

          this.logger.debug(`[executeIntention] Executing precondition: ${pre.name}`, { url: finalPreUrl, headers: preHeaders, body: preBody || 'None' });

          const preResponse = await fetch(finalPreUrl, { method: pre.httpMethod.toUpperCase(), headers: preHeaders, body: preBody || undefined });
          const preResponseText = await preResponse.text();
          const preJson = JSON.parse(preResponseText);

          if (!preResponse.ok) {
            throw new Error(`Precondition "${pre.name}" failed with HTTP ${preResponse.status}: ${preJson?.error?.message || 'Unknown error'}`);
          }

          const sandbox = { preJson, ...fields, preconditions: [{}] };
          if (pre.failureCondition && vm.runInNewContext(pre.failureCondition, sandbox)) {
            throw new Error(pre.failureMessage || `Precondition "${pre.name}" failed.`);
          }

          if (pre.successAction) {
            const script = new vm.Script(pre.successAction);
            script.runInContext(vm.createContext(sandbox));
            preconditionResults[index] = sandbox;
          }
        }
      }

      // Build finalUrl with template replacement and query parameters
      let finalUrl = intention.url;
      
      // Replace preconditions[0].key in URL
      finalUrl = finalUrl.replace(/\{\{preconditions\[(\d+)\]\.(.*?)\}\}/g, (_, idx, key) => encodeURIComponent(preconditionResults?.[idx]?.[key] ?? ''));
      
      // Replace field templates in URL
      Object.keys(fields).forEach(key => {
        finalUrl = finalUrl.replace(`{{${key}}}`, encodeURIComponent(fields[key]));
      });

      // Handle query parameters for the main intention
      if (Array.isArray(intention.queryParams)) {
        const searchParams = new URLSearchParams();
        for (const param of intention.queryParams) {
          let value = param.value;
          // Replace preconditions references
          value = value.replace(/\{\{preconditions\[(\d+)\]\.(.*?)\}\}/g, (_, idx, key) => preconditionResults?.[idx]?.[key] ?? '');
          // Replace field templates
          value = this.resolveTemplate(value, fields);
          searchParams.append(param.name, value);
        }
        finalUrl += `${finalUrl.includes('?') ? '&' : '?'}${searchParams.toString()}`;
      }

      // For GET requests, append inputFields as query parameters if they're not already included
      if (intention.httpMethod.toUpperCase() === 'GET') {
        const existingParams = new URLSearchParams(finalUrl.split('?')[1] || '');
        const additionalParams = new URLSearchParams();
        
        Object.keys(fields).forEach(key => {
          // Only add if not already present in URL or queryParams
          if (!existingParams.has(key)) {
            additionalParams.append(key, String(fields[key]));
          }
        });
        
        if (additionalParams.toString()) {
          finalUrl += `${finalUrl.includes('?') ? '&' : '?'}${additionalParams.toString()}`;
        }
      }

      const resolvedHeaders = intention.headers.map(header => {
        let value = header.value.replace('{{DYNAMIC_GOOGLE_ACCESS_TOKEN}}', accessToken);
        value = value.replace(/\{\{preconditions\[(\d+)\]\.(.*?)\}\}/g, (_, idx, key) => preconditionResults?.[idx]?.[key] ?? '');
        Object.keys(fields).forEach(k => value = value.replace(`{{${k}}}`, fields[k]));
        return { name: header.name, value };
      });

      let resolvedBody: string | undefined = undefined;
      if (intention.requestBody) {
        const rawRendered = this.renderTemplate(intention.requestBody, fields);
        try {
          resolvedBody = JSON.stringify(JSON.parse(rawRendered));
        } catch (err) {
          this.logger.warn(`[executeIntention] Request body is not valid JSON after templating`, { rawTemplate: intention.requestBody, resolvedBody: rawRendered, fields, error: err.message });
          throw new Error('Invalid request body format');
        }
      }

      const headers: Record<string, string> = {};
      resolvedHeaders.forEach(h => headers[h.name] = h.value);

      this.logger.debug(`[executeIntention] Making HTTP request`, { method: intention.httpMethod.toUpperCase(), url: finalUrl, headers, body: resolvedBody || 'None' });

      const response = await fetch(finalUrl, { method: intention.httpMethod.toUpperCase(), headers, body: resolvedBody || undefined });
      const responseBody = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${responseBody}`);
      }

      return {
        success: true,
        data: responseBody ? JSON.parse(responseBody) : {},
        statusCode: response.status
      };
    } catch (error) {
      this.logger.error(`[executeIntention] Intention execution failed: ${error.message}`, error.stack || '');
      throw error;
    }
  }

  private resolveTemplate(template: string, fields: Record<string, any>): string {
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
    agentTimezone?: string,
  ): Promise<any> {
    if (!scheduleSettings) throw new Error('Schedule settings not configured.');

    const tz = agentTimezone || 'UTC';
    const start = new Date(fields.startDateTime);
    const end = new Date(fields.endDateTime);

    // Transform the JSON field to the proper DTO class
    const transformedSettings = {
      ...scheduleSettings,
      availableTimes: scheduleSettings.availableTimes
        ? plainToInstance(AvailableTimesDto, scheduleSettings.availableTimes)
        : undefined,
    };

    const validationError = this.scheduleValidationService.validateSchedule(start, end, transformedSettings);

    console.log({validationError});
    if (validationError) {
      throw new Error(validationError);
    }

    try {
      return await this.executeIntention(intention, fields, agentId, tz);
    } catch(error) {
      if (error.message.includes('unavailable')) {
        // Check availability using Google Calendar FreeBusy API (replace with actual logic)
        const now = new Date();
        fields.startSearch = fields.startSearch || now.toISOString();
        fields.endSearch = fields.endSearch || new Date(now.getTime() + 7 * 86400000).toISOString();

        const suggestAvailableSlotsIntention = intentions.find(i => i.toolName === 'suggest_available_google_meeting_slots');
        const response = await this.executeIntention(
          suggestAvailableSlotsIntention, fields, agentId, tz
        );
        throw new Error(JSON.stringify(response, null, 3));

      } else {
        throw new Error(error);
      }
    }
  }
}
