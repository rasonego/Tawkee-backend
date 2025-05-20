import { ApiProperty } from '@nestjs/swagger';

export class MessageDto {
  @ApiProperty({
    description: 'Profile picture of the user',
    example: 'https://example.com/profile.jpg',
    nullable: true,
  })
  userPicture: string | null;

  @ApiProperty({
    description: 'Name of the file',
    example: 'document.pdf',
    nullable: true,
  })
  fileName: string | null;

  @ApiProperty({
    description: 'Role in the chat',
    example: 'user',
  })
  role: string;

  @ApiProperty({
    description: 'URL of the document',
    example: 'https://example.com/documents/123.pdf',
  })
  documentUrl: string;

  @ApiProperty({
    description: 'Type of message',
    example: 'text',
  })
  type: string;

  @ApiProperty({
    description: 'Name of the user',
    example: 'John Doe',
    nullable: true,
  })
  userName: string | null;

  @ApiProperty({
    description: 'Media content',
    example: 'base64-encoded-content',
    nullable: true,
  })
  midiaContent: string | null;

  @ApiProperty({
    description: 'ID of the user',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  userId: string;

  @ApiProperty({
    description: 'URL of the audio',
    example: 'https://example.com/audio/123.mp3',
  })
  audioUrl: string;

  @ApiProperty({
    description: 'URL of the image',
    example: 'https://example.com/images/123.jpg',
  })
  imageUrl: string;

  @ApiProperty({
    description: 'Width of the image/media',
    example: 800,
  })
  width: number;

  @ApiProperty({
    description: 'ID of the message',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Text content of the message',
    example: 'Hello, how can I help you?',
  })
  text: string;

  @ApiProperty({
    description: 'Timestamp of the message',
    example: 1619712345678,
  })
  time: number;

  @ApiProperty({
    description: 'Height of the image/media',
    example: 600,
  })
  height: number;
}
