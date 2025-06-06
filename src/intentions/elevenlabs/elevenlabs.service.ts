import { IntentionsService } from '../intentions.service';
import { CreateIntentionDto } from '../dto/create-intention.dto';
import { PreprocessingType, FieldType } from '@prisma/client';
import { elevenLabsSpeechToSpeechIntention, elevenLabsTextToSpeechIntention, elevenLabsVoiceCloningIntention } from './elevenlabs.intentions';

// Usage example with your controller
export class ElevenLabsService {
  constructor(
    private readonly intentionsService: IntentionsService
) {}

  async createElevenLabsIntentions(agentId: string) {
    // Create Text-to-Speech intention
    const ttsIntention = await this.intentionsService.create(
      agentId,
      elevenLabsTextToSpeechIntention
    );

    // Create Voice Cloning intention
    const vcIntention = await this.intentionsService.create(
      agentId,
      elevenLabsVoiceCloningIntention
    );

    // Create Speech-to-Speech intention
    const stsIntention = await this.intentionsService.create(
      agentId,
      elevenLabsSpeechToSpeechIntention
    );

    return {
      textToSpeech: ttsIntention,
      voiceCloning: vcIntention,
      speechToSpeech: stsIntention
    };
  }
}

// Example of how to use with your existing controller endpoints:
/*
// POST /agent/{agentId}/intentions
// Body: elevenLabsTextToSpeechIntention

// The AI agent can now:
// 1. Collect text input from users
// 2. Automatically call ElevenLabs API
// 3. Generate high-quality speech audio
// 4. Return audio file URL or base64 data

// Typical flow:
// User: "Convert this text to speech: 'Hello, welcome to our service'"
// Agent: Extracts text → Calls ElevenLabs → Returns audio file
*/