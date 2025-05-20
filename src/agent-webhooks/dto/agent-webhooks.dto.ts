import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl } from 'class-validator';

export class AgentWebhooksDto {
  @ApiProperty({
    description: 'URL to call when a new message arrives',
    example: 'https://example.com/webhook/new-message',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUrl({}, { message: 'onNewMessage must be a valid URL' })
  @IsString()
  onNewMessage: string | null;

  @ApiProperty({
    description: 'URL to call when the agent lacks knowledge to answer',
    example: 'https://example.com/webhook/lack-knowledge',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUrl({}, { message: 'onLackKnowLedge must be a valid URL' })
  @IsString()
  onLackKnowLedge: string | null;

  @ApiProperty({
    description: 'URL to call when the agent transfers to a human',
    example: 'https://example.com/webhook/transfer',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUrl({}, { message: 'onTransfer must be a valid URL' })
  @IsString()
  onTransfer: string | null;

  @ApiProperty({
    description: 'URL to call when an attendance is finished',
    example: 'https://example.com/webhook/finish-attendance',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUrl({}, { message: 'onFinishAttendance must be a valid URL' })
  @IsString()
  onFinishAttendance: string | null;
}
