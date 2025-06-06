import { ApiProperty } from "@nestjs/swagger";

export class ElevenLabsModelDto {
  @ApiProperty({
    description: 'Model identifier',
    example: 'eleven_monolingual_v1'
  })
  model_id: string;

  @ApiProperty({
    description: 'Model name',
    example: 'Eleven Monolingual v1'
  })
  name: string;

  @ApiProperty({
    description: 'Model description',
    example: 'Use our standard English language model to generate speech in a variety of voices, emotions and speaking styles.'
  })
  description: string;

  @ApiProperty({
    description: 'Whether the model can be fine-tuned',
    example: false
  })
  can_be_finetuned: boolean;

  @ApiProperty({
    description: 'Whether the model supports text-to-speech',
    example: true
  })
  can_do_text_to_speech: boolean;

  @ApiProperty({
    description: 'Whether the model supports voice conversion',
    example: false
  })
  can_do_voice_conversion: boolean;

  @ApiProperty({
    description: 'Supported languages',
    example: ['en']
  })
  languages: string[];

  @ApiProperty({
    description: 'Model token costs',
    type: 'object',
    properties: {
      input_cost_per_1k_chars: { type: 'number' },
      output_cost_per_1k_chars: { type: 'number' }
    }
  })
  token_cost_factor?: {
    input_cost_per_1k_chars: number;
    output_cost_per_1k_chars: number;
  };
}