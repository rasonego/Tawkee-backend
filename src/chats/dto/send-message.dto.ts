import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    description: 'Message content to send',
    example: 'Hello, I need assistance with my order.',
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}
