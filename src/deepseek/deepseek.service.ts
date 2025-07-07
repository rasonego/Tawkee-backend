import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { CreditService } from 'src/credits/credit.service';

@Injectable()
export class DeepseekService {
  private readonly deepseek: OpenAI;
  private readonly logger = new Logger(DeepseekService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly creditService: CreditService
  ) {
    const apiKey = this.configService.get<string>('DEEPSEEK_API_KEY');

    if (!apiKey) {
      this.logger.error(
        'Deepseek API key (DEEPSEEK_API_KEY) is not configured!'
      );
      // Optionally throw an error or handle appropriately
    }

    this.deepseek = new OpenAI({
      apiKey: apiKey,
      baseURL: 'https://api.deepseek.com', // Use Deepseek API endpoint
    });
  }

  /**
   * Map internal model names to actual Deepseek model IDs
   * @param model The internal model name (e.g., DEEPSEEK_CHAT)
   * @returns The actual model ID to use with the API (e.g., deepseek-chat)
   */
  private getModelId(model?: string): string {
    // Default to deepseek-chat if no model specified
    const defaultModel = 'deepseek-chat';
    if (!model) return defaultModel;

    // Map internal names to actual Deepseek model IDs
    // Add more models as needed based on Deepseek offerings
    const modelMap: { [key: string]: string } = {
      DEEPSEEK_CHAT: 'deepseek-chat', // General chat model (DeepSeek-V3 as per docs)
      DEEPSEEK_REASONER: 'deepseek-reasoner', // Reasoning model (DeepSeek-R1 as per docs)
      // Add other potential Deepseek models here if they become available
    };

    if (modelMap[model]) {
      return modelMap[model];
    }

    // Fallback for unknown models
    this.logger.warn(
      `Unknown model "${model}" requested for Deepseek, falling back to ${defaultModel}`
    );
    return defaultModel;
  }

  /**
   * Generate a response using the specified Deepseek model
   * @param prompt The prompt to send to Deepseek
   * @param modelPreference The preferred model name (e.g., DEEPSEEK_CHAT)
   * @param systemMessage Optional system message to set the context
   * @returns The generated text response
   */
  async generateResponse(
    prompt: string,
    modelPreference?: string,
    systemMessage?: string
  ): Promise<string> {
    try {
      const messages: ChatCompletionMessageParam[] = [];

      // Add system message if provided
      if (systemMessage) {
        messages.push({
          role: 'system',
          content: systemMessage,
        });
      }

      // Add user prompt
      messages.push({
        role: 'user',
        content: prompt,
      });

      // Get the appropriate Deepseek model ID
      const modelId = this.getModelId(modelPreference);
      this.logger.debug(`Using Deepseek model ${modelId} for generation`);

      // Make the API call to Deepseek (using OpenAI SDK structure)
      const response = await this.deepseek.chat.completions.create({
        model: modelId,
        messages: messages,
        temperature: 0.7, // Keep similar default settings
        max_tokens: 500, // Keep similar default settings
        // Add other Deepseek-specific parameters if needed
      });

      // Ensure response and choices exist
      if (
        response.choices &&
        response.choices.length > 0 &&
        response.choices[0].message
      ) {
        return response.choices[0].message.content || '';
      } else {
        this.logger.error(
          'Received an unexpected response structure from Deepseek API'
        );
        throw new Error('Invalid response structure from Deepseek API');
      }
    } catch (error: any) {
      this.logger.error(
        `Error generating response from Deepseek: ${error.message}`,
        error.stack
      );
      throw error;
    }
  }

  /**
   * Build a prompt with communication style guide and goal guide
   * (This function is largely provider-agnostic and can be reused)
   * @param userMessage The user's message
   * @param communicationGuide Guide for the communication style
   * @param goalGuide Guide for the agent type
   * @param agent Additional agent settings
   * @param conversationContext Optional previous conversation history
   * @param retrievedContext Optional RAG context
   * @returns A formatted prompt string
   */
  buildPrompt(
    userMessage: string,
    communicationGuide: string,
    goalGuide: string,
    agent: any, // Consider defining a stricter type for agent
    conversationContext?: string,
    retrievedContext?: string
  ): string {
    // This implementation is copied directly from the OpenAiService
    // as it focuses on prompt structuring, not the API call itself.
    let prompt = `You are an AI assistant named ${agent.name || 'Assistant'}.`;

    if (agent.jobName || agent.jobSite || agent.jobDescription) {
      prompt += '\n\n## PROFESSIONAL CONTEXT';
      if (agent.jobName) prompt += `\n- Role: ${agent.jobName}`;
      if (agent.jobSite) prompt += `\n- Company Website: ${agent.jobSite}`;
      if (agent.jobDescription)
        prompt += `\n- Job Description: ${agent.jobDescription}`;
    }

    prompt += `\n\n## COMMUNICATION STYLE GUIDE\n${communicationGuide}`;
    prompt += `\n\n## GOAL GUIDE\n${goalGuide}`;

    if (agent.settings) {
      prompt += '\n\n## BEHAVIOR SETTINGS';
      if (agent.settings.enabledEmoji === false) {
        prompt += '\n- Do not use emojis in your responses.';
      } else {
        prompt +=
          '\n- Feel free to use appropriate emojis in your responses when suitable.';
      }
      if (agent.settings.limitSubjects === true) {
        prompt +=
          '\n- Only discuss topics directly related to the company, product, or your specific role. Politely decline to discuss unrelated subjects.';
      }
      if (agent.settings.enabledHumanTransfer === true) {
        prompt +=
          "\n- If you can't resolve an issue or if the user explicitly asks for a human, acknowledge that you can transfer them to a human agent.";
      }
      // Message splitting preference
      if (agent.settings.splitMessages === true) {
        prompt +=
          '\n- Keep responses concise. If you need to provide a lengthy answer, break it into multiple shorter paragraphs. **WARNING: Use the | character to delimit sentences!**';
      } else {
        prompt += '\n- Aim to provide complete answers in a single response.';
      }

      if (agent.settings.timezone) {
        prompt += `\n- When discussing time-related matters, consider the user's timezone (${agent.settings.timezone}).`;
      }
    }

    if (agent.trainings && agent.trainings.length > 0) {
      prompt += '\n\n## SPECIFIC KNOWLEDGE AND TRAINING';
      agent.trainings.forEach((training: any) => {
        prompt += `\n- ${training.title}: ${training.content}`;
      });
    }

    if (agent.intentions && agent.intentions.length > 0) {
      prompt += '\n\n## BEHAVIOR INTENTIONS';
      agent.intentions.forEach((intention: any) => {
        prompt += `\n- ${intention.title}: ${intention.content}`;
      });
    }

    if (retrievedContext && retrievedContext.length > 0) {
      prompt += '\n\n## RETRIEVED KNOWLEDGE';
      prompt += `\n${retrievedContext}`;
      prompt +=
        "\n\nUse the above retrieved knowledge to inform your response when relevant to the user's query.";
    }

    if (conversationContext && conversationContext.length > 0) {
      prompt += `\n\n## CONVERSATION HISTORY\n${conversationContext}`;
    }

    prompt += `\n\n## CURRENT USER MESSAGE\n${userMessage}`;
    prompt += `\n\nRespond to the user message according to your professional context, communication style guide, goal guide, and behavior settings provided above. Be concise, helpful, and true to your assigned role and communication style. Do not include labels like "Assistant:" in your response.`;

    return prompt;
  }

  /**
   * Generate a complete response for a user message based on agent settings using Deepseek
   * @param userMessage The user's message
   * @param agent The agent configuration
   * @param communicationGuide Communication style guide
   * @param goalGuide Goal guide
   * @param conversationContext Optional conversation history
   * @param retrievedContext Optional RAG context
   * @returns The AI-generated response from Deepseek
   */
  async generateAgentResponse(
    userMessage: string,
    agent: any, // Define a stricter type
    communicationGuide: string,
    goalGuide: string,
    conversationContext?: string,
    retrievedContext?: string
  ): Promise<string> {
    // Build the prompt using the provider-agnostic method
    const systemPrompt = this.buildPrompt(
      userMessage, // Note: In the original, the userMessage was part of the system prompt context.
      communicationGuide,
      goalGuide,
      agent,
      conversationContext,
      retrievedContext
    );

    this.logger.debug(
      `Generated system prompt for Deepseek: ${systemPrompt.substring(0, 100)}...`
    );

    // Determine the model to use based on agent settings or default
    let modelPreference = 'DEEPSEEK_CHAT'; // Default Deepseek model
    if (agent.settings && agent.settings.preferredModel) {
      // Ensure the preferredModel name matches keys in getModelId map
      modelPreference = agent.settings.preferredModel;
      this.logger.debug(
        `Using agent's preferred Deepseek model: ${modelPreference}`
      );
    }

    // Generate the response using the main generateResponse method
    // Pass the structured prompt as the system message and the user message separately
    // (Adjusting based on typical chat completion patterns)
    // Generate the response from OpenAI using the appropriate model
    const response = await this.generateResponse(userMessage, modelPreference, systemPrompt);
    
    // Log credit consumption
    await this.creditService.logAndAggregateCredit(agent.id, {message: response});    

    return response;
  }
}
