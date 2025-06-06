import { FieldType, PreprocessingType } from "@prisma/client";
import { CreateIntentionDto } from "../dto/create-intention.dto";

// ElevenLabs Text-to-Speech Intention Configuration
export const elevenLabsTextToSpeechIntention: CreateIntentionDto = {
  toolName: 'text-to-speech',
  description: 'Generate high-quality speech audio from text using ElevenLabs AI voice synthesis',
  preprocessingMessage: PreprocessingType.GENERATE,
  preprocessingText: undefined, // Will be auto-generated
  type: 'WEBHOOK',
  httpMethod: 'POST',
  url: 'https://api.elevenlabs.io/v1/text-to-speech/{voice_id}',
  requestBody: JSON.stringify({
    text: '{{text}}',
    model_id: '{{model_id}}',
    voice_settings: {
      stability: '{{stability}}',
      similarity_boost: '{{similarity_boost}}',
      style: '{{style}}',
      use_speaker_boost: '{{use_speaker_boost}}'
    }
  }),
  autoGenerateParams: false,
  autoGenerateBody: false,
  fields: [
    {
      name: 'Text to Convert',
      jsonName: 'text',
      description: 'The text content to be converted to speech audio',
      type: FieldType.TEXT,
      required: true
    },
    {
      name: 'Voice ID',
      jsonName: 'voice_id',
      description: 'ElevenLabs voice ID for the desired voice character',
      type: FieldType.TEXT,
      required: true
    },
    {
      name: 'Model ID',
      jsonName: 'model_id',
      description: 'ElevenLabs model to use (e.g., eleven_monolingual_v1, eleven_multilingual_v2)',
      type: FieldType.TEXT,
      required: false
    },
    {
      name: 'Voice Stability',
      jsonName: 'stability',
      description: 'Voice stability setting (0.0 to 1.0) - higher values make voice more consistent',
      type: FieldType.NUMBER,
      required: false
    },
    {
      name: 'Similarity Boost',
      jsonName: 'similarity_boost',
      description: 'Similarity boost setting (0.0 to 1.0) - higher values make voice more similar to original',
      type: FieldType.NUMBER,
      required: false
    },
    {
      name: 'Speaking Style',
      jsonName: 'style',
      description: 'Speaking style intensity (0.0 to 1.0) - controls expressiveness',
      type: FieldType.NUMBER,
      required: false
    },
    {
      name: 'Speaker Boost',
      jsonName: 'use_speaker_boost',
      description: 'Whether to use speaker boost for better quality',
      type: FieldType.BOOLEAN,
      required: false
    }
  ],
  headers: [
    {
      name: 'Content-Type',
      value: 'application/json'
    },
    {
      name: 'Accept',
      value: 'audio/mpeg'
    },
    {
      name: 'xi-api-key',
      value: '{{ELEVENLABS_API_KEY}}' // Should be replaced with actual API key
    }
  ],
  params: [
    {
      name: 'optimize_streaming_latency',
      value: '0'
    },
    {
      name: 'output_format',
      value: 'mp3_44100_128'
    }
  ]
};

// Alternative: ElevenLabs Voice Cloning Intention
export const elevenLabsVoiceCloningIntention: CreateIntentionDto = {
  toolName: 'voice-cloning',
  description: 'Clone a voice using ElevenLabs instant voice cloning from audio samples',
  preprocessingMessage: PreprocessingType.MANUAL,
  preprocessingText: 'I need to clone a voice using audio samples to create a custom voice model',
  type: 'WEBHOOK',
  httpMethod: 'POST',
  url: 'https://api.elevenlabs.io/v1/voices/add',
  requestBody: undefined, // Will be form-data for file upload
  autoGenerateParams: false,
  autoGenerateBody: true,
  fields: [
    {
      name: 'Voice Name',
      jsonName: 'name',
      description: 'Name for the cloned voice',
      type: FieldType.TEXT,
      required: true
    },
    {
      name: 'Voice Description',
      jsonName: 'description',
      description: 'Description of the voice characteristics',
      type: FieldType.TEXT,
      required: false
    },
    {
      name: 'Audio Files',
      jsonName: 'files',
      description: 'Audio files to use for voice cloning (URLs or file paths)',
      type: FieldType.TEXT,
      required: true
    },
    {
      name: 'Voice Labels',
      jsonName: 'labels',
      description: 'Labels to categorize the voice (comma-separated)',
      type: FieldType.TEXT,
      required: false
    }
  ],
  headers: [
    {
      name: 'Content-Type',
      value: 'multipart/form-data'
    },
    {
      name: 'xi-api-key',
      value: '{{ELEVENLABS_API_KEY}}'
    }
  ],
  params: []
};

// ElevenLabs Speech-to-Speech Intention
export const elevenLabsSpeechToSpeechIntention: CreateIntentionDto = {
  toolName: 'speech-to-speech',
  description: 'Convert speech audio to different voice using ElevenLabs speech-to-speech technology',
  preprocessingMessage: PreprocessingType.GENERATE,
  preprocessingText: undefined,
  type: 'WEBHOOK',
  httpMethod: 'POST',
  url: 'https://api.elevenlabs.io/v1/speech-to-speech/{voice_id}',
  requestBody: undefined, // Will be form-data for audio file
  autoGenerateParams: false,
  autoGenerateBody: true,
  fields: [
    {
      name: 'Voice ID',
      jsonName: 'voice_id',
      description: 'Target voice ID for speech conversion',
      type: FieldType.TEXT,
      required: true
    },
    {
      name: 'Audio File',
      jsonName: 'audio',
      description: 'Input audio file URL or path to convert',
      type: FieldType.TEXT,
      required: true
    },
    {
      name: 'Model ID',
      jsonName: 'model_id',
      description: 'ElevenLabs model for speech-to-speech conversion',
      type: FieldType.TEXT,
      required: false
    },
    {
      name: 'Voice Stability',
      jsonName: 'stability',
      description: 'Voice stability setting (0.0 to 1.0)',
      type: FieldType.NUMBER,
      required: false
    },
    {
      name: 'Similarity Boost',
      jsonName: 'similarity_boost',
      description: 'Similarity boost setting (0.0 to 1.0)',
      type: FieldType.NUMBER,
      required: false
    }
  ],
  headers: [
    {
      name: 'Content-Type',
      value: 'multipart/form-data'
    },
    {
      name: 'Accept',
      value: 'audio/mpeg'
    },
    {
      name: 'xi-api-key',
      value: '{{ELEVENLABS_API_KEY}}'
    }
  ],
  params: [
    {
      name: 'output_format',
      value: 'mp3_44100_128'
    }
  ]
};