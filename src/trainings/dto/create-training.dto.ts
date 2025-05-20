import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { TrainingType } from '@prisma/client';

export class CreateTrainingDto {
  @ApiProperty({
    description: 'Training type',
    enum: TrainingType,
    example: TrainingType.TEXT,
  })
  @IsEnum(TrainingType)
  type: TrainingType;

  @ApiProperty({
    description: 'Text content (for TEXT type)',
    example: 'This is training content for the agent to learn from.',
    required: false,
  })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiProperty({
    description: 'Image URL (for TEXT type with image)',
    example: 'https://example.com/image.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty({
    description: 'Website URL (for WEBSITE type)',
    example: 'https://example.com',
    required: false,
  })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiProperty({
    description: 'Whether to train on sub-pages (for WEBSITE type)',
    example: 'DISABLED',
    required: false,
  })
  @IsOptional()
  @IsString()
  trainingSubPages?: string;

  @ApiProperty({
    description: 'Training interval (for WEBSITE type)',
    example: 'ONE_DAY',
    required: false,
  })
  @IsOptional()
  @IsString()
  trainingInterval?: string;

  @ApiProperty({
    description: 'Video URL (for VIDEO type)',
    example: 'https://example.com/video.mp4',
    required: false,
  })
  @IsOptional()
  @IsString()
  video?: string;

  @ApiProperty({
    description: 'Document URL (for DOCUMENT type)',
    example: 'https://example.com/document.pdf',
    required: false,
  })
  @IsOptional()
  @IsString()
  documentUrl?: string;

  @ApiProperty({
    description: 'Document name (for DOCUMENT type)',
    example: 'product-manual.pdf',
    required: false,
  })
  @IsOptional()
  @IsString()
  documentName?: string;

  @ApiProperty({
    description: 'Document MIME type (for DOCUMENT type)',
    example: 'application/pdf',
    required: false,
  })
  @IsOptional()
  @IsString()
  documentMimetype?: string;
}
