import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateVoiceDto {
  @ApiProperty({
    description: 'Name for the new voice',
    example: 'My Custom Voice'
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Description of the voice',
    example: 'A custom voice created from audio samples',
    required: false
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Labels for categorizing the voice (comma-separated)',
    example: 'male, young, american',
    required: false
  })
  @IsOptional()
  @IsString()
  labels?: string;
}