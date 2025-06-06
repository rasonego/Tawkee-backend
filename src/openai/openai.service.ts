import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ChatCompletionTool, CreateEmbeddingResponse } from 'openai/resources';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

// Import ffmpeg-static and fluent-ffmpeg
const ffmpegStatic = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');

// Set the ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

interface ProcessingOptions {
  language?: string;
  prompt?: string;
  maxKeyFrames?: number;
  frameWidth?: number;
  batchSize?: number;
  detailLevel?: 'low' | 'high';
  extractFrames?: boolean;
}

@Injectable()
export class OpenAiService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAiService.name);

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    if (!apiKey) {
      this.logger.error('OpenAI API key is not configured!');
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }

  /**
   * Map AIModel enum to actual model IDs for different LLM providers
   * @param model The AIModel enum value
   * @returns The actual model ID to use with the API
   */
  private getModelId(model: string): string {
    // Default to GPT-4o if no model specified
    if (!model) return 'gpt-4o';

    // Map AIModel enum values to actual model IDs
    const modelMap = {
      GPT_4_1: 'gpt-4-0125-preview', // GPT-4 Turbo
      GPT_4_1_MINI: 'gpt-4-0125-preview',
      GPT_4_O_MINI: 'gpt-4o-mini',
      GPT_4_O: 'gpt-4o', // The newest OpenAI model is "gpt-4o" which was released May 13, 2024
      OPEN_AI_O3_MINI: 'gpt-3.5-turbo',
      OPEN_AI_O4_MINI: 'gpt-4o-mini',
      OPEN_AI_O3: 'gpt-3.5-turbo',
      OPEN_AI_O1: 'gpt-3.5-turbo',
      GPT_4: 'gpt-4',
      // For non-OpenAI models, we'll fallback to GPT-4o but log a warning
      CLAUDE_3_5_SONNET: 'gpt-4o',
      CLAUDE_3_7_SONNET: 'gpt-4o',
      CLAUDE_3_5_HAIKU: 'gpt-4o',
      DEEPINFRA_LLAMA3_3: 'gpt-4o',
      QWEN_2_5_MAX: 'gpt-4o',
      DEEPSEEK_CHAT: 'gpt-4o',
      SABIA_3: 'gpt-4o',
    };

    if (modelMap[model]) {
      // If it's not an OpenAI model, log a warning that we're using a fallback
      if (
        model.startsWith('CLAUDE') ||
        model.startsWith('DEEPINFRA') ||
        model.startsWith('QWEN') ||
        model.startsWith('DEEPSEEK') ||
        model.startsWith('SABIA')
      ) {
        this.logger.warn(
          `Non-OpenAI model ${model} requested, falling back to gpt-4o`
        );
      }

      return modelMap[model];
    }

    // Default fallback
    this.logger.warn(
      `Unknown model ${model} requested, falling back to gpt-4o`
    );
    return 'gpt-4o';
  }

  /**
   * Generate a response using the specified model
   * @param prompt The prompt to send to OpenAI
   * @param modelPreference The preferred model to use (AIModel enum value)
   * @param systemMessage Optional system message to set the context
   * @returns The generated text response
   */
  async generateResponse(
    prompt: string,
    modelPreference?: string,
    systemMessage?: string
  ): Promise<string> {
    try {
      const messages = [];

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

      // Get the appropriate model ID based on the model preference
      const modelId = this.getModelId(modelPreference);
      this.logger.debug(`Using model ${modelId} for generation`);

      // Make the API call to OpenAI
      const response = await this.openai.chat.completions.create({
        model: modelId,
        messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      return response.choices[0].message.content;
    } catch (error) {
      this.logger.error(`Error generating response from OpenAI: ${error}`);
      throw error;
    }
  }

  /**
   * Build a prompt with communication style guide and goal guide
   * @param userMessage The user's message
   * @param communicationGuide Guide for the communication style (FORMAL, NORMAL, RELAXED)
   * @param goalGuide Guide for the agent type (SUPPORT, SALE, PERSONAL)
   * @param agentSettings Additional agent settings to include in the prompt
   * @param conversationContext Optional previous conversation history
   * @returns A formatted prompt for OpenAI
   */
  buildPrompt(
    userMessage: string,
    communicationGuide: string,
    goalGuide: string,
    agent: any,
    conversationContext?: string,
    retrievedContext?: string
  ): string {
    // Base system instruction
    let prompt = `You are an AI assistant named ${agent.name || 'Assistant'}.`;

    // Add professional context if available
    if (agent.jobName || agent.jobSite || agent.jobDescription) {
      prompt += '\n\n## PROFESSIONAL CONTEXT';

      if (agent.jobName) {
        prompt += `\n- Role: ${agent.jobName}`;
      }

      if (agent.jobSite) {
        prompt += `\n- Company Website: ${agent.jobSite}`;
      }

      if (agent.jobDescription) {
        prompt += `\n- Job Description: ${agent.jobDescription}`;
      }
    }

    // Add communication guide
    prompt += `\n\n## COMMUNICATION STYLE GUIDE\n${communicationGuide}`;

    // Add goal guide
    prompt += `\n\n## GOAL GUIDE\n${goalGuide}`;

    // Add behavioral settings if available
    if (agent.settings) {
      prompt += '\n\n## BEHAVIOR SETTINGS';

      // Emoji usage
      if (agent.settings.enabledEmoji === false) {
        prompt += '\n- Do not use emojis in your responses.';
      } else {
        prompt +=
          '\n- Feel free to use appropriate emojis in your responses when suitable.';
      }

      // Subject limitations
      if (agent.settings.limitSubjects === true) {
        prompt +=
          '\n- Only discuss topics directly related to the company, product, or your specific role. Politely decline to discuss unrelated subjects.';
      }

      // Human transfer capability
      if (agent.settings.enabledHumanTransfer === true) {
        prompt +=
          "\n- If you can't resolve an issue or if the user explicitly asks for a human, acknowledge that you can transfer them to a human agent.";
      }

      // Message splitting preference
      if (agent.settings.splitMessages === true) {
        prompt +=
          '\n- Keep responses concise. If you need to provide a lengthy answer, break it into multiple shorter paragraphs.';
      } else {
        prompt += '\n- Aim to provide complete answers in a single response.';
      }

      // Timezone awareness
      if (agent.settings.timezone) {
        prompt += `\n- When discussing time-related matters, consider the user's timezone (${agent.settings.timezone}).`;
      }
    }

    // Add any specific training or intentions if available
    if (agent.trainings && agent.trainings.length > 0) {
      prompt += '\n\n## SPECIFIC KNOWLEDGE AND TRAINING';
      agent.trainings.forEach((training) => {
        prompt += `\n- ${training.title}: ${training.content}`;
      });
    }

    // Add any specific intentions if available
    if (agent.intentions && agent.intentions.length > 0) {
      prompt += '\n\n## BEHAVIOR INTENTIONS';
      agent.intentions.forEach((intention) => {
        prompt += `\n- ${intention.title}: ${intention.content}`;
      });
    }

    // Add retrieved context from RAG if available
    if (retrievedContext && retrievedContext.length > 0) {
      prompt += '\n\n## RETRIEVED KNOWLEDGE';
      prompt += `\n${retrievedContext}`;
      prompt +=
        "\n\nUse the above retrieved knowledge to inform your response when relevant to the user's query.";
    }

    // Add conversation history if available
    if (conversationContext && conversationContext.length > 0) {
      prompt += `\n\n## CONVERSATION HISTORY\n${conversationContext}`;
    }

    // Add context about the current user message
    prompt += `\n\n## CURRENT USER MESSAGE\n${userMessage}`;

    // Final instruction
    prompt += `\n\nRespond to the user message according to your professional context, communication style guide, goal guide, and behavior settings provided above. Be concise, helpful, and true to your assigned role and communication style. Do not include labels like "Assistant:" in your response.`;

    return prompt;
  }

  /**
   * Generate a complete response for a user message based on agent settings
   * @param userMessage The user's message to respond to
   * @param agent The agent configuration
   * @param communicationGuide The communication style guide
   * @param goalGuide The goal guide
   * @param conversationContext Optional previous conversation history
   * @returns The AI-generated response
   */
  async generateAgentResponse(
    userMessage: string,
    agent: any,
    communicationGuide: string,
    goalGuide: string,
    conversationContext?: string,
    retrievedContext?: string // New parameter for RAG context
  ): Promise<string> {
    // Build the prompt incorporating all agent settings and guides
    const prompt = this.buildPrompt(
      userMessage,
      communicationGuide,
      goalGuide,
      agent,
      conversationContext,
      retrievedContext // Pass retrieved context to buildPrompt
    );

    this.logger.debug(
      `Generated prompt for OpenAI: ${prompt.substring(0, 100)}...`
    );

    // Determine the model to use
    let modelPreference = 'GPT_4_O'; // Default to GPT-4o

    // If agent has settings with a preferred model, use that instead
    if (agent.settings && agent.settings.preferredModel) {
      modelPreference = agent.settings.preferredModel;
      this.logger.debug(`Using agent's preferred model: ${modelPreference}`);
    }

    // Generate the response from OpenAI using the appropriate model
    return this.generateResponse(prompt, modelPreference);
  }

  /**
   * Generate embeddings for text using OpenAI
   * @param text The text to generate embeddings for
   * @returns An array of embedding values
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      this.logger.debug(
        `Generating embedding for text: ${text.substring(0, 50)}...`
      );

      const response: CreateEmbeddingResponse =
        await this.openai.embeddings.create({
          model: 'text-embedding-3-small', // Using OpenAI's latest embedding model
          input: text,
          encoding_format: 'float',
        });

      this.logger.debug(
        `Generated embedding with ${response.data[0].embedding.length} dimensions`
      );

      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(`Error generating embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate image descriptions using OpenAI
   * @param imageUrl the URL from the target image to generate text description
   * @returns A description of the image given
   */
  async describeImage(
    imageUrl: string,
    customPrompt?: string,
    detailLevel: 'low' | 'high' = 'high'
  ): Promise<string> {
    try {
      // this.logger.log(`About to describe image: ${imageUrl}`);

      // Default prompt for image description
      const defaultPrompt =
        'Please describe this image in detail, including any text you can see, objects, people, settings, and overall context.';
      const prompt = customPrompt || defaultPrompt;

      // Prepare the messages for OpenAI API
      const messages: Array<{
        role: 'user';
        content: Array<
          | { type: 'text'; text: string }
          | {
              type: 'image_url';
              image_url: { url: string; detail: 'low' | 'high' };
            }
        >;
      }> = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: detailLevel,
              },
            },
          ],
        },
      ];

      // console.log(JSON.stringify(messages, null, 3));

      // Make the API call to OpenAI
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o', // Explicitly use GPT-4o for vision capabilities
        messages: messages,
        max_tokens: 1000, // Adjust based on your needs
        temperature: 0.3, // Lower temperature for more consistent descriptions
      });

      const description = response.choices[0]?.message?.content;

      if (!description) {
        throw new Error('No description received from OpenAI');
      }

      this.logger.log(
        `Successfully described image: ${description.substring(0, 100)}...`
      );
      return description;
    } catch (error) {
      this.logger.error(
        `Error describing image: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to describe image: ${error.message}`);
    }
  }

  // Alternative method for describing images from buffer/base64
  async describeImageFromBuffer(
    imageBuffer: Buffer,
    mimeType: string,
    customPrompt?: string,
    detailLevel: 'low' | 'high' = 'high'
  ): Promise<string> {
    try {
      this.logger.log(
        `About to describe image from buffer, mime type: ${mimeType}`
      );

      // Convert buffer to base64
      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64Image}`;

      // Default prompt for image description
      const defaultPrompt =
        'Please describe this image in detail, including any text you can see, objects, people, settings, and overall context.';
      const prompt = customPrompt || defaultPrompt;

      // Prepare the messages for OpenAI API
      const messages: Array<{
        role: 'user';
        content: Array<
          | { type: 'text'; text: string }
          | {
              type: 'image_url';
              image_url: { url: string; detail: 'low' | 'high' };
            }
        >;
      }> = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
                detail: detailLevel,
              },
            },
          ],
        },
      ];

      // Make the API call to OpenAI
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        max_tokens: 1000,
        temperature: 0.3,
      });

      const description = response.choices[0]?.message?.content;

      if (!description) {
        throw new Error('No description received from OpenAI');
      }

      this.logger.log(
        `Successfully described image from buffer: ${description.substring(0, 100)}...`
      );
      return description;
    } catch (error) {
      this.logger.error(
        `Error describing image from buffer: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to describe image from buffer: ${error.message}`);
    }
  }

  // Enhanced method that can handle scanned documents by describing them
  async extractTextFromScannedDocument(
    imageUrl: string,
    customPrompt?: string
  ): Promise<string> {
    try {
      // this.logger.log(
      //   `About to extract text from scanned document: ${imageUrl}`
      // );

      // Specific prompt for text extraction from scanned documents
      const textExtractionPrompt =
        customPrompt ||
        'Please extract and transcribe all visible text from this scanned document. ' +
          'Maintain the original formatting as much as possible, including paragraphs, ' +
          'headings, and any structured elements. If there are tables, preserve their structure. ' +
          'Only return the extracted text content, not a description of the document.' +
          'If the document is an image, then describe it in high detail, as much as possible.';

      return this.describeImage(imageUrl, textExtractionPrompt, 'high');
    } catch (error) {
      this.logger.error(
        `Error extracting text from scanned document: ${error.message}`,
        error.stack
      );
      throw new Error(
        `Failed to extract text from scanned document: ${error.message}`
      );
    }
  }

  async transcribeAudio(
    formData: FormData,
    language?: string,
    prompt?: string
  ): Promise<string> {
    try {
      this.logger.debug('Transcribing audio from FormData');

      // Create the transcription request
      const transcriptionParams: any = {
        file: formData.get('file'),
        model: 'whisper-1',
      };

      // Add optional parameters if provided
      if (language) {
        transcriptionParams.language = language;
      }

      if (prompt) {
        transcriptionParams.prompt = prompt;
      }

      const response = await this.openai.audio.transcriptions.create(transcriptionParams);

      this.logger.log(
        `Successfully transcribed audio: ${response.text.substring(0, 100)}...`
      );

      return response.text;
    } catch (error) {
      this.logger.error(
        `Error transcribing audio: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to transcribe audio: ${error.message}`);
    }
  }

  async transcribeAudioFromUrl(
    audioUrl: string,
    language?: string,
    prompt?: string
  ): Promise<string> {
    try {
      this.logger.debug(`Transcribing audio from URL: ${audioUrl}`);

      // Download the audio file using axios (consistent with your existing pattern)
      const axios = require('axios');
      const response = await axios.get(audioUrl, { 
        responseType: 'arraybuffer'
      });
      
      const buffer = Buffer.from(response.data);

      // Convert buffer to blob for OpenAI API
      const audioBlob = new Blob([buffer]);

      // Create FormData
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.mp3'); // Default filename

      // Use the existing transcribeAudio method
      return this.transcribeAudio(formData, language, prompt);
    } catch (error) {
      this.logger.error(
        `Error transcribing audio from URL: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to transcribe audio from URL: ${error.message}`);
    }
  }

  async transcribeAudioFromBuffer(
    audioBuffer: Buffer,
    mimeType: string,
    language?: string,
    prompt?: string
  ): Promise<string> {
    try {
      this.logger.log(
        `About to transcribe audio from buffer, mime type: ${mimeType}`
      );

      // Convert buffer to blob
      const audioBlob = new Blob([audioBuffer], { type: mimeType });

      // Determine file extension from MIME type
      const extensionMap = {
        'audio/mpeg': 'mp3',
        'audio/mp4': 'm4a',
        'audio/wav': 'wav',
        'audio/webm': 'webm',
        'audio/ogg': 'ogg',
        'audio/x-m4a': 'm4a',
      };

      const extension = extensionMap[mimeType] || 'mp3';
      const filename = `audio.${extension}`;

      // Create FormData
      const formData = new FormData();
      formData.append('file', audioBlob, filename);

      const transcription = await this.transcribeAudio(formData, language, prompt);

      this.logger.log(
        `Successfully transcribed audio from buffer: ${transcription.substring(0, 100)}...`
      );

      return transcription;
    } catch (error) {
      this.logger.error(
        `Error transcribing audio from buffer: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to transcribe audio from buffer: ${error.message}`);
    }
  }

  async transcribeVideoContentFromBuffer(
    videoBuffer: Buffer,
    mimeType: string,
    options: ProcessingOptions = {}
  ): Promise<string> {
    const {
      language,
      prompt,
      maxKeyFrames = 2, // Reduced from 15 to 2 (much less frames)
      frameWidth = 512,
      batchSize = 3, // Reduced batch size since we have fewer frames
      detailLevel = 'high',
      extractFrames = true // Default to true for backward compatibility
    } = options;

    let tempVideoPath: string;
    let tempAudioPath: string;
    let tempFramesDir: string;

    try {
      this.logger.log(`Extracting and transcribing video content from buffer, mime type: ${mimeType}`);

      // Create temporary file paths
      const tempDir = os.tmpdir();
      const timestamp = Date.now();
      tempVideoPath = path.join(tempDir, `video_${timestamp}.tmp`);
      tempAudioPath = path.join(tempDir, `audio_${timestamp}.wav`);
      tempFramesDir = path.join(tempDir, `frames_${timestamp}`);

      // Create frames directory
      if (!fs.existsSync(tempFramesDir)) {
        fs.mkdirSync(tempFramesDir, { recursive: true });
      }

      // Write video buffer to temporary file
      fs.writeFileSync(tempVideoPath, videoBuffer);

      // Extract audio and optionally key frames
      if (extractFrames) {
        await new Promise<void>((resolve, reject) => {
          const frameOutputPath = path.join(tempFramesDir, 'keyframe_%04d.jpg');
          
          ffmpeg(tempVideoPath)
            // Audio extraction settings
            .audioCodec('pcm_s16le')
            .audioFrequency(16000)
            .audioChannels(1)
            .format('wav')
            .output(tempAudioPath)
            
            // Key frame extraction settings with more selective filtering
            .outputOptions([
              '-vf', `select='key*gte(key\\,0)*not(mod(n\\,30))',scale=${frameWidth}:-1`, // More selective: key frames every 30 frames
              '-vsync', 'vfr',
              '-frames:v', maxKeyFrames.toString(),
              '-q:v', '2' // High quality JPEG
            ])
            .output(frameOutputPath)
            
            .on('end', () => {
              this.logger.debug('Audio and key frame extraction completed successfully');
              resolve();
            })
            .on('error', (err) => {
              this.logger.error(`FFmpeg error: ${err.message}`);
              reject(new Error(`Content extraction failed: ${err.message}`));
            })
            .on('start', (commandLine) => {
              this.logger.debug(`FFmpeg command: ${commandLine}`);
            })
            .run();
        });
      } else {
        // Extract audio only
        await new Promise<void>((resolve, reject) => {
          ffmpeg(tempVideoPath)
            .audioCodec('pcm_s16le')
            .audioFrequency(16000)
            .audioChannels(1)
            .format('wav')
            .output(tempAudioPath)
            
            .on('end', () => {
              this.logger.debug('Audio extraction completed successfully');
              resolve();
            })
            .on('error', (err) => {
              this.logger.error(`FFmpeg error: ${err.message}`);
              reject(new Error(`Audio extraction failed: ${err.message}`));
            })
            .on('start', (commandLine) => {
              this.logger.debug(`FFmpeg command: ${commandLine}`);
            })
            .run();
        });
      }

      // Process audio and optionally frames
      const audioTranscription = await this.processAudio(tempAudioPath, language, prompt);
      
      let frameDescriptions: Array<{ timestamp: number; description: string }> = [];
      if (extractFrames) {
        frameDescriptions = await this.processKeyFramesWithAI(tempFramesDir, batchSize, detailLevel, prompt);
      }

      // Combine audio and visual content into structured text
      const combinedTranscription = this.createStructuredTranscription(
        audioTranscription, 
        frameDescriptions, 
        prompt,
        extractFrames
      );

      this.logger.log(
        `Successfully transcribed video content: ${combinedTranscription.substring(0, 100)}...`
      );

      return combinedTranscription;

    } catch (error) {
      this.logger.error(
        `Error transcribing video content from buffer: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to transcribe video content: ${error.message}`);
    } finally {
      // Clean up temporary files
      await this.cleanupTempFiles(tempVideoPath, tempAudioPath, tempFramesDir);
    }
  }

  async transcribeVideoContentFromUrl(
    videoUrl: string,
    options: ProcessingOptions = {}
  ): Promise<string> {
    try {
      this.logger.debug(`Transcribing video content from URL: ${videoUrl}`);

      // Download the video file using axios
      const axios = require('axios');
      const response = await axios.get(videoUrl, { 
        responseType: 'arraybuffer',
        timeout: 180000 // Extended timeout for video files
      });
      
      const videoBuffer = Buffer.from(response.data);

      // Determine MIME type from URL or use default
      const mimeType = this.determineMimeTypeFromUrl(videoUrl);

      // Use the buffer method to extract content
      return this.transcribeVideoContentFromBuffer(videoBuffer, mimeType, options);

    } catch (error) {
      this.logger.error(
        `Error transcribing video content from URL: ${error.message}`,
        error.stack
      );
      throw new Error(`Failed to transcribe video content from URL: ${error.message}`);
    }
  }

  private async processAudio(
    audioPath: string, 
    language?: string, 
    prompt?: string
  ): Promise<string> {
    try {
      const audioBuffer = fs.readFileSync(audioPath);
      return await this.transcribeAudioFromBuffer(
        audioBuffer,
        'audio/wav',
        language,
        prompt
      );
    } catch (error) {
      this.logger.error(`Audio processing failed: ${error.message}`);
      throw error;
    }
  }

  private async processKeyFramesWithAI(
    framesDir: string, 
    batchSize: number = 5,
    detailLevel: 'low' | 'high' = 'high',
    contextPrompt?: string
  ): Promise<Array<{ timestamp: number; description: string }>> {
    try {
      // Get all frame files sorted by name (which corresponds to timestamp)
      const frameFiles = fs.readdirSync(framesDir)
        .filter(file => file.endsWith('.jpg'))
        .sort();

      if (frameFiles.length === 0) {
        this.logger.warn('No key frames extracted from video');
        return [];
      }

      const frameDescriptions: Array<{ timestamp: number; description: string }> = [];

      // Custom prompt for video frames
      const framePrompt = contextPrompt 
        ? `Describe this video frame in detail, focusing on visual elements that complement this context: "${contextPrompt}". Include any text, objects, people, actions, and settings visible.`
        : 'Describe this video frame in detail, including any text you can see, objects, people, actions, settings, and overall visual context.';

      // Process frames in batches to avoid overwhelming the API
      for (let i = 0; i < frameFiles.length; i += batchSize) {
        const batch = frameFiles.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (fileName) => {
          const framePath = path.join(framesDir, fileName);
          const frameNumber = parseInt(fileName.match(/\d+/)?.[0] || '0');
          
          // Estimate timestamp (approximate - based on key frame sequence)
          const estimatedTimestamp = frameNumber * 10; // Increased interval since we have fewer frames
          
          try {
            // Convert image file to base64 data URL for the API
            const imageBuffer = fs.readFileSync(framePath);
            const base64Image = imageBuffer.toString('base64');
            const dataUrl = `data:image/jpeg;base64,${base64Image}`;
            
            // Use the existing describeImage method
            const description = await this.describeImage(dataUrl, framePrompt, detailLevel);
            
            return {
              timestamp: estimatedTimestamp,
              description
            };
          } catch (error) {
            this.logger.warn(`Failed to describe frame ${fileName}: ${error.message}`);
            return {
              timestamp: estimatedTimestamp,
              description: `[Frame at ${estimatedTimestamp}s - Description unavailable]`
            };
          }
        });

        const batchResults = await Promise.all(batchPromises);
        frameDescriptions.push(...batchResults);

        // Add delay between batches to respect API rate limits
        if (i + batchSize < frameFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      this.logger.debug(`Processed ${frameDescriptions.length} key frames with AI descriptions`);
      return frameDescriptions.sort((a, b) => a.timestamp - b.timestamp);

    } catch (error) {
      this.logger.error(`Key frame AI processing failed: ${error.message}`);
      throw error;
    }
  }

  private createStructuredTranscription(
    audioTranscription: string,
    frameDescriptions: Array<{ timestamp: number; description: string }>,
    originalPrompt?: string,
    includeFrames: boolean = true
  ): string {
    const sections = [];

    // Add header with context
    if (originalPrompt) {
      sections.push(`CONTEXT: ${originalPrompt}\n`);
    }

    // Add audio transcription section
    sections.push('=== AUDIO TRANSCRIPTION ===');
    sections.push(audioTranscription);
    sections.push('');

    // Add visual content section only if frames were processed
    if (includeFrames && frameDescriptions.length > 0) {
      sections.push('=== VISUAL CONTENT (KEY FRAMES) ===');
      
      frameDescriptions.forEach((frame, index) => {
        sections.push(`[${this.formatTimestamp(frame.timestamp)}] Frame ${index + 1}:`);
        sections.push(frame.description);
        sections.push('');
      });
    }

    // Add summary section
    sections.push('=== CONTENT SUMMARY ===');
    sections.push(`Audio Length: ~${Math.ceil(audioTranscription.length / 100)} segments`);
    if (includeFrames) {
      sections.push(`Visual Frames: ${frameDescriptions.length} key moments captured`);
      sections.push(`Total Content: Combined audio-visual transcription with temporal markers`);
    } else {
      sections.push(`Content Type: Audio-only transcription`);
    }

    return sections.join('\n');
  }

  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  private determineMimeTypeFromUrl(videoUrl: string): string {
    const urlLower = videoUrl.toLowerCase();
    
    if (urlLower.includes('.mov')) return 'video/quicktime';
    if (urlLower.includes('.avi')) return 'video/x-msvideo';
    if (urlLower.includes('.mkv')) return 'video/x-matroska';
    if (urlLower.includes('.webm')) return 'video/webm';
    if (urlLower.includes('.wmv')) return 'video/x-ms-wmv';
    if (urlLower.includes('.flv')) return 'video/x-flv';
    
    return 'video/mp4'; // Default
  }

  private async cleanupTempFiles(
    videoPath?: string, 
    audioPath?: string, 
    framesDir?: string
  ): Promise<void> {
    const cleanupTasks = [];

    if (videoPath && fs.existsSync(videoPath)) {
      cleanupTasks.push(fs.promises.unlink(videoPath));
    }

    if (audioPath && fs.existsSync(audioPath)) {
      cleanupTasks.push(fs.promises.unlink(audioPath));
    }

    if (framesDir && fs.existsSync(framesDir)) {
      cleanupTasks.push(
        fs.promises.rm(framesDir, { recursive: true, force: true })
      );
    }

    try {
      await Promise.all(cleanupTasks);
      this.logger.debug('Temporary files cleaned up successfully');
    } catch (cleanupError) {
      this.logger.warn(`Failed to clean up some temporary files: ${cleanupError.message}`);
    }
  }

  async callWithToolDetection(
    userPrompt: string,
    toolSchemas: OpenAI.Chat.Completions.ChatCompletionTool[],
    modelPreference = 'gpt-4o'
  ): Promise<{
    toolCall?: ChatCompletionTool;
    extractedFields?: Record<string, any>;
    fallbackMessage?: string;
  }> {
    try {
      const modelId = this.getModelId(modelPreference);

      this.logger.debug(`[OpenAiService] Starting tool detection with model: ${modelId}`);
      this.logger.debug(`[OpenAiService] User prompt: ${userPrompt}`);
      this.logger.debug(`[OpenAiService] Tool schemas: ${JSON.stringify(toolSchemas, null, 2)}`);

      const response = await this.openai.chat.completions.create({
        model: modelId,
        messages: [
          {
            role: 'system',
            content: `You have access to function tools. Use the appropriate tool when user intent matches.`
          },
          { role: 'user', content: userPrompt }
        ],
        tools: toolSchemas,
        tool_choice: 'auto',
      });

      this.logger.debug(`[OpenAiService] Raw OpenAI response:\n${JSON.stringify(response, null, 2)}`);

      const toolCalls = response.choices[0]?.message?.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        const toolCall = toolCalls[0];
        this.logger.debug(`[OpenAiService] Tool called: ${toolCall.function.name}`);
        this.logger.debug(`[OpenAiService] Raw arguments: ${toolCall.function.arguments}`);

        const args = JSON.parse(toolCall.function.arguments || '{}');

        return {
          toolCall,
          extractedFields: args,
        };
      }

      this.logger.warn('[OpenAiService] No tool call returned by OpenAI.');
      return {
        fallbackMessage: response.choices?.[0].message?.content ?? undefined
      };
    } catch (error) {
      this.logger.error(`Error in callWithToolDetection: ${error.message}`);
      this.logger.error(error.stack);
      return {};
    }
  }


/**
 * Generate a natural response for successful intention execution
 * @param intention - The executed intention
 * @param result - The result of the intention execution
 * @param agent - The agent context
 * @param communicationGuide - The communication style guide
 * @returns Natural language response
 */
  async generateIntentionSuccessResponse(
    intention: any,
    result: any,
    agent: any,
    communicationGuide: string
  ): Promise<string> {
    try {
      const prompt = `
  Generate a natural, helpful response to confirm that an action was completed successfully.

  Context:
  - Agent Name: ${agent.name}
  - Agent Type: ${agent.type}
  - Communication Style: ${agent.communicationType}
  - Action Completed: ${intention.description}
  - Result Data: ${JSON.stringify(result.data || {}, null, 2)}

  Communication Guide:
  ${communicationGuide}

  Generate a response that:
  1. Confirms the action was completed successfully
  2. Mentions relevant details from the result if appropriate
  3. Maintains the agent's communication style
  4. Is helpful and reassuring
  5. Is concise but informative

  Response:`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant generating success confirmation messages. Be natural, concise, and match the specified communication style.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const responseText = response.choices[0]?.message?.content?.trim();
      
      if (!responseText) {
        // Fallback response
        return `Great! I've successfully completed the ${intention.description.toLowerCase()} for you.`;
      }

      return responseText;

    } catch (error) {
      this.logger.error(`Error generating intention success response: ${error.message}`);
      
      // Fallback response
      return `Perfect! I've successfully handled your ${intention.description.toLowerCase()}.`;
    }
  }

/**
 * Generate a natural error response for failed intention execution
 * @param intention - The failed intention
 * @param error - The error that occurred
 * @param agent - The agent context
 * @param communicationGuide - The communication style guide
 * @returns Natural language error response
 */
  async generateIntentionErrorResponse(
    intention: any,
    error: any,
    agent: any,
    communicationGuide: string
  ): Promise<string> {
    try {
      const prompt = `
  Generate a natural, apologetic response for when an action failed to complete.

  Context:
  - Agent Name: ${agent.name}
  - Agent Type: ${agent.type}
  - Communication Style: ${agent.communicationType}
  - Failed Action: ${intention.description}
  - Error: ${error.message || 'Unknown error'}

  Communication Guide:
  ${communicationGuide}

  Generate a response that:
  1. Apologizes for the issue
  2. Briefly mentions what went wrong (without technical details)
  3. Offers next steps or alternatives if possible
  4. Maintains the agent's communication style
  5. Is empathetic and helpful

  Response:`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant generating empathetic error messages. Be apologetic, helpful, and match the specified communication style.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 300
      });

      const responseText = response.choices[0]?.message?.content?.trim();
      
      if (!responseText) {
        // Fallback response
        return `I apologize, but I encountered an issue while trying to ${intention.description.toLowerCase()}. Please try again or contact support if the problem persists.`;
      }

      return responseText;

    } catch (error) {
      this.logger.error(`Error generating intention error response: ${error.message}`);
      
      // Fallback response
      return `I'm sorry, but I'm unable to ${intention.description.toLowerCase()} right now due to a technical issue. Please try again later.`;
    }
  }

/**
 * Generate a clarification message asking for missing required fields
 * @param intention - The intention requiring more information
 * @param missingFields - Array of missing field names
 * @param collectedFields - Already collected field values
 * @param agent - The agent context
 * @param communicationGuide - The communication style guide
 * @returns Natural language clarification request
 */
  async generateClarificationMessage(
    intention: any,
    missingFields: string[],
    collectedFields: Record<string, any>,
    agent: any,
    communicationGuide: string
  ): Promise<string> {
    try {
      const collectedInfo = Object.keys(collectedFields).length > 0 
        ? `Already collected: ${JSON.stringify(collectedFields, null, 2)}`
        : 'No information collected yet';

      const fieldDetails = intention.fields
        .filter(field => missingFields.includes(field.name))
        .map(field => `- ${field.name}: ${field.description} (Type: ${field.type}, Required: ${field.required})`)
        .join('\n');

      const prompt = `
  Generate a helpful message asking the user for missing information to complete an action.

  Context:
  - Agent Name: ${agent.name}
  - Agent Type: ${agent.type}
  - Communication Style: ${agent.communicationType}
  - Action to Complete: ${intention.description}
  - ${collectedInfo}
  - Missing Fields:
  ${fieldDetails}

  Communication Guide:
  ${communicationGuide}

  Generate a response that:
  1. Enthusiastically offers to help with the action
  2. Acknowledges any information already provided
  3. Clearly asks for the missing information
  4. Makes it easy to understand what's needed
  5. Maintains the agent's communication style
  6. Is encouraging and helpful

  Response:`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant generating clarification requests. Be encouraging, clear, and match the specified communication style.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 400
      });

      const responseText = response.choices[0]?.message?.content?.trim();
      
      if (!responseText) {
        // Fallback response
        let message = `I'd be happy to help you ${intention.description.toLowerCase()}! `;
        
        if (Object.keys(collectedFields).length > 0) {
          message += `I have some of the information already. `;
        }
        
        message += `To proceed, I need the following details:\n\n`;
        
        missingFields.forEach((fieldName, index) => {
          const field = intention.fields.find(f => f.name === fieldName);
          message += `${index + 1}. ${field.name}: ${field.description}\n`;
        });
        
        message += `\nPlease provide this information and I'll take care of it for you!`;
        
        return message;
      }

      return responseText;

    } catch (error) {
      this.logger.error(`Error generating clarification message: ${error.message}`);
      
      // Simple fallback
      return `To help you with ${intention.description.toLowerCase()}, I need some additional information. Could you please provide: ${missingFields.join(', ')}?`;
    }
  }
}
