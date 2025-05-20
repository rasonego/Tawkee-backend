import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class AddMessageDto {
  @ApiProperty({
    description: 'External ID to identify the client',
    example: '12345',
  })
  @IsString()
  @IsNotEmpty()
  contextId: string;

  @ApiProperty({
    description: 'Text for the agent to respond to',
    example: 'What is your name?',
  })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({
    description: 'Role of the message sender',
    example: 'user',
    required: false,
  })
  @IsOptional()
  @IsString()
  role?: string;
}
