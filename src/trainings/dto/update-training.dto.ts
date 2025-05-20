import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { TrainingType } from '@prisma/client';

export class UpdateTrainingDto {
  @ApiProperty({
    description: 'Training type (only TEXT type is allowed for updates)',
    enum: [TrainingType.TEXT],
    example: TrainingType.TEXT,
  })
  @IsEnum(TrainingType)
  type: TrainingType;

  @ApiProperty({
    description: 'Text content',
    example: 'This is updated training content for the agent to learn from.',
  })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({
    description: 'Image URL',
    example: 'https://example.com/image.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  image?: string;
}
