import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MediaDto {
  @ApiProperty({
    description: 'Media URL',
    example: 'https://github.com/devlikeapro/waha/raw/core/examples/waha.jpg',
  })
  @IsString()
  url: string;

  @ApiProperty({
    description: 'Media Caption',
    example: 'Check this out!',
  })
  @IsString()
  caption: string;

  @ApiProperty({
    description: 'Media Type',
    example: 'image',
  })
  @IsString()
  type: 'image' | 'video' | 'audio' | 'document';

  @ApiProperty({
    description: 'Media Mimetype',
    example: 'image/jpeg',
  })
  @IsString()
  mimetype: string;

  @ApiProperty({
    description: 'Media File Name',
    example: 'filename.jpeg',
  })
  @IsString()
  filename: string;
}

export class SendMessageDto {
  @ApiProperty({
    description: 'Message content to send',
    example: 'Hello, I need assistance with my order.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    description: 'Media content',
    example: JSON.stringify({
      caption: 'Check this out!',
      type: 'image',
      mimetype: 'image/jpeg',
      filename: 'filename.jpeg',
      url: 'https://raw.githubusercontent.com/devlikeapro/waha/core/examples/video.mp4',
    }),
  })
  media: MediaDto;
}
