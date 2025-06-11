import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

interface TextToAudioOptions {
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

interface VoiceCloningOptions {
  name: string;
  description?: string;
  files: string[]; // Array of file paths for audio samples
}

interface DeleteVoiceOptions {
  voiceId: string;
}

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private readonly API_BASE_URL = 'https://api.elevenlabs.io/v1';

  constructor() {}

  private getApiKey(): string {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('Missing ELEVENLABS_API_KEY environment variable');
    }
    return apiKey;
  }

  async textToAudio(options: TextToAudioOptions): Promise<any> {
    try {
      const { text, voiceId, modelId, stability, similarityBoost } = options;
      const apiKey = this.getApiKey();

      this.logger.log(`Converting text to audio for voice ID: ${voiceId}`);

      const response = await axios.post(
        `${this.API_BASE_URL}/text-to-speech/${voiceId}`,
        {
          text,
          model_id: modelId || 'eleven_monolingual_v1',
          voice_settings: {
            stability: stability !== undefined ? stability : 0.75,
            similarity_boost: similarityBoost !== undefined ? similarityBoost : 0.75,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
            'Accept': 'audio/mpeg',
          },
          responseType: 'arraybuffer', // To handle audio binary data
        }
      );

      if (response.status === 200) {
        this.logger.log('Text successfully converted to audio.');
        return response.data; // This will be the audio binary data
      } else {
        this.logger.warn(`Unexpected response from ElevenLabs API: ${JSON.stringify(response.data)}`);
        return null;
      }
    } catch (error) {
      this.handleError(error, 'textToAudio');
      return null;
    }
  }

  async cloneVoice(options: VoiceCloningOptions): Promise<any> {
    try {
      const { name, description, files } = options;
      const apiKey = this.getApiKey();

      this.logger.log(`Cloning voice: ${name} with ${files.length} audio samples.`);

      const formData = new FormData();
      formData.append('name', name);
      if (description) {
        formData.append('description', description);
      }
      for (const filePath of files) {
        // In a real NestJS app, you'd handle file streams or buffers here.
        // For this example, we'll assume files are accessible and can be read.
        // This part needs adjustment based on how files are handled in your backend.
        // Example: formData.append('files', fs.createReadStream(filePath));
        // For a simple mock, we'll just add a placeholder.
        formData.append('files', new Blob(['audio_data'], { type: 'audio/mpeg' }), 'audio_sample.mp3');
      }

      const response = await axios.post(
        `${this.API_BASE_URL}/voices/add`,
        formData,
        {
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': `multipart/form-data; boundary=${(formData as any)._boundary}`, // Axios handles boundary, but good to be explicit
          },
        }
      );

      if (response.status === 200 || response.status === 201) {
        this.logger.log(`Voice '${name}' cloned successfully. Voice ID: ${response.data.voice_id}`);
        return response.data;
      } else {
        this.logger.warn(`Unexpected response from ElevenLabs API: ${JSON.stringify(response.data)}`);
        return null;
      }
    } catch (error) {
      this.handleError(error, 'cloneVoice');
      return null;
    }
  }

  async deleteVoice(options: DeleteVoiceOptions): Promise<any> {
    try {
      const { voiceId } = options;
      const apiKey = this.getApiKey();

      this.logger.log(`Deleting voice ID: ${voiceId}`);

      const response = await axios.delete(
        `${this.API_BASE_URL}/voices/${voiceId}`,
        {
          headers: {
            'xi-api-key': apiKey,
          },
        }
      );

      if (response.status === 200) {
        this.logger.log(`Voice ID '${voiceId}' deleted successfully.`);
        return response.data;
      } else {
        this.logger.warn(`Unexpected response from ElevenLabs API: ${JSON.stringify(response.data)}`);
        return null;
      }
    } catch (error) {
      this.handleError(error, 'deleteVoice');
      return null;
    }
  }

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