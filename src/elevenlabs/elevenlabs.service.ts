import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

import { PrismaService } from 'src/prisma/prisma.service';
import { ElevenLabsSettingsDto } from './dto/elevenlabs.dto';

interface TextToAudioOptions {
  text: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

const ENCRYPTION_KEY = process.env.ELEVENLABS_ENCRYPTION_SECRET!.padEnd(32, '0').slice(0, 32); // Must be 32 bytes
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(encryptedText: string): string {
  const [ivHex, encryptedHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private readonly API_BASE_URL = 'https://api.elevenlabs.io/v1';
  
  constructor(
    private readonly prisma: PrismaService
  ) {}

  private async validateElevenLabsApiKey(apiKey: string): Promise<{success: boolean, data: any}> {
    try {
      await axios.get(`${this.API_BASE_URL}/voices`, {
        headers: { 'xi-api-key': apiKey },
      });

      const userResponse = await axios.get(`${this.API_BASE_URL}/user`, {
        headers: { 'xi-api-key': apiKey },
      });

      return {
        success: userResponse.status == 200,
        data: userResponse.data
      };
    } catch {
      return {
        success: false,
        data: null
      };
    }
  }

  private async getApiKey(agentId: string): Promise<string> {
    const settings = await this.prisma.elevenLabsSettings.findFirst({
      where: { agentId },
      select: { elevenLabsApiKey: true },
    });

    if (!settings?.elevenLabsApiKey) {
      throw new Error(`Missing ElevenLabs API key for agent ${agentId}`);
    }

    return decrypt(settings.elevenLabsApiKey);
  }

  async activateIntegration({ apiKey, agentId }: { apiKey: string; agentId: string }): Promise<void> {
    const { success, data } = await this.validateElevenLabsApiKey(apiKey);
    if (!success) {
      throw new BadRequestException('Invalid ElevenLabs API key');
    }

    const encryptedKey = encrypt(apiKey);

    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId }
    });

    if (!agent) {
      throw new BadRequestException(`Agent ID ${agentId} not found!`);
    }

    await this.prisma.elevenLabsSettings.update({
      where: { agentId },
      data: { 
        elevenLabsApiKey: encryptedKey,
        connected: true,
        respondAudioWithAudio: true,
        alwaysRespondWithAudio: false,
        userName: data.first_name,
        characterCount: data.subscription.character_count,
        characterLimit: data.subscription.character_limit,
        subscriptionTier: data.subscription.tier
      },
    });

    this.logger.log(`Stored encrypted ElevenLabs API key for agent ${agentId}`);
  }

  async deactivateIntegration(agentId: string): Promise<void> {
    await this.prisma.elevenLabsSettings.update({
      where: { agentId },
      data: { 
        connected: false,
        elevenLabsApiKey: '',
        selectedElevenLabsVoiceId: '',
        respondAudioWithAudio: false,
        alwaysRespondWithAudio: false
      },
    });

    this.logger.log(`Removed ElevenLabs API key for agent ${agentId}`);
  }

  async getData(agentId: string): Promise<any> {
    const apiKey = await this.getApiKey(agentId);

    const voicesResponse = await axios.get(`${this.API_BASE_URL}/voices`, {
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
    });

    const userResponse = await axios.get(`${this.API_BASE_URL}/user`, {
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
    })

    return {
      voices: voicesResponse.data,
      user: {
        userName: userResponse.data.first_name,
        characterCount: userResponse.data.character_count,
        characterLimit: userResponse.data.character_limit,
        subscriptionTier: userResponse.data.subscription.tier      }
    };
  }

  async updateData(agentId: string, body: Partial<ElevenLabsSettingsDto>): Promise<void> {
    await this.prisma.elevenLabsSettings.update({
      where: { agentId },
      data: {
        ...body
      },
    });

    this.logger.log(`Updated selected ElevenLabs data for agent ${agentId}`);
  }

  async textToAudio(agentId: string, options: TextToAudioOptions): Promise<any> {
    try {
      const { text } = options;
      const apiKey = await this.getApiKey(agentId);

      // Get agent's selected voice ID
      const settings = await this.prisma.elevenLabsSettings.findUnique({
        where: { agentId },
        select: { 
          selectedElevenLabsVoiceId: true,
          stability: true,
          similarityBoost: true         
        },
      });

      if (!settings?.selectedElevenLabsVoiceId) {
        throw new BadRequestException('No ElevenLabs voice selected for this agent.');
      }

      const voiceId = settings.selectedElevenLabsVoiceId;

      this.logger.log(`Converting text to audio for voice ID: ${voiceId}`);

      const response = await axios.post(
        `${this.API_BASE_URL}/text-to-speech/${voiceId}`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: settings.stability,
            similarity_boost: settings.similarityBoost
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
            'Accept': 'audio/mpeg',
          },
          responseType: 'arraybuffer',
        }
      );

      if (response.status === 200) {
        this.logger.log('Text successfully converted to audio.');
        return response.data;
      } else {
        this.logger.warn(`Unexpected response from ElevenLabs API: ${JSON.stringify(response.data)}`);
        return null;
      }
    } catch (error) {
      this.handleError(error, 'textToAudio');
      return null;
    }
  }

  // async cloneVoice(options: VoiceCloningOptions): Promise<any> {
  //   try {
  //     const { name, description, files } = options;
  //     const apiKey = this.getApiKey();

  //     this.logger.log(`Cloning voice: ${name} with ${files.length} audio samples.`);

  //     const formData = new FormData();
  //     formData.append('name', name);
  //     if (description) {
  //       formData.append('description', description);
  //     }
  //     for (const filePath of files) {
  //       // In a real NestJS app, you'd handle file streams or buffers here.
  //       // For this example, we'll assume files are accessible and can be read.
  //       // This part needs adjustment based on how files are handled in your backend.
  //       // Example: formData.append('files', fs.createReadStream(filePath));
  //       // For a simple mock, we'll just add a placeholder.
  //       formData.append('files', new Blob(['audio_data'], { type: 'audio/mpeg' }), 'audio_sample.mp3');
  //     }

  //     const response = await axios.post(
  //       `${this.API_BASE_URL}/voices/add`,
  //       formData,
  //       {
  //         headers: {
  //           'xi-api-key': apiKey,
  //           'Content-Type': `multipart/form-data; boundary=${(formData as any)._boundary}`, // Axios handles boundary, but good to be explicit
  //         },
  //       }
  //     );

  //     if (response.status === 200 || response.status === 201) {
  //       this.logger.log(`Voice '${name}' cloned successfully. Voice ID: ${response.data.voice_id}`);
  //       return response.data;
  //     } else {
  //       this.logger.warn(`Unexpected response from ElevenLabs API: ${JSON.stringify(response.data)}`);
  //       return null;
  //     }
  //   } catch (error) {
  //     this.handleError(error, 'cloneVoice');
  //     return null;
  //   }
  // }

  // async deleteVoice(options: DeleteVoiceOptions): Promise<any> {
  //   try {
  //     const { voiceId } = options;
  //     const apiKey = this.getApiKey();

  //     this.logger.log(`Deleting voice ID: ${voiceId}`);

  //     const response = await axios.delete(
  //       `${this.API_BASE_URL}/voices/${voiceId}`,
  //       {
  //         headers: {
  //           'xi-api-key': apiKey,
  //         },
  //       }
  //     );

  //     if (response.status === 200) {
  //       this.logger.log(`Voice ID '${voiceId}' deleted successfully.`);
  //       return response.data;
  //     } else {
  //       this.logger.warn(`Unexpected response from ElevenLabs API: ${JSON.stringify(response.data)}`);
  //       return null;
  //     }
  //   } catch (error) {
  //     this.handleError(error, 'deleteVoice');
  //     return null;
  //   }
  // }

  private handleError(error: any, methodName: string): void {
    if (error.response) {
      this.logger.error(
        `ElevenLabs API error in ${methodName}: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      this.logger.error(`ElevenLabs API no response in ${methodName}: ${error.message}`);
    } else {
      this.logger.error(`Error in ${methodName}: ${error.message}`, error.stack);
    }
  }
}