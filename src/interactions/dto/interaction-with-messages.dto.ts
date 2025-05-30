import { ApiProperty } from '@nestjs/swagger';
import { InteractionStatus } from '@prisma/client'; // Assuming InteractionStatus enum exists
import { MessageDto } from './message.dto';

export class InteractionWithMessagesDto {
  @ApiProperty({ description: 'Interaction ID' })
  id: string;

  @ApiProperty({ description: 'ID of the agent handling the interaction' })
  agentId: string;

  @ApiProperty({ description: 'Name of the agent' })
  agentName: string;

  @ApiProperty({ description: 'Avatar URL of the agent', nullable: true })
  agentAvatar: string | null;

  @ApiProperty({ description: 'ID of the chat associated with the interaction' })
  chatId: string;

  @ApiProperty({ description: 'Name of the chat', nullable: true })
  chatName: string | null;

  @ApiProperty({ description: 'Current status of the interaction', enum: InteractionStatus })
  status: InteractionStatus;

  @ApiProperty({ description: 'Timestamp when the interaction started' })
  startAt: Date;

  @ApiProperty({ description: 'Timestamp when the interaction was transferred', nullable: true })
  transferAt: Date | null;

  @ApiProperty({ description: 'Timestamp when the interaction was resolved', nullable: true })
  resolvedAt: Date | null;

  @ApiProperty({ description: 'ID of the user associated with the interaction', nullable: true })
  userId: string | null;

  @ApiProperty({ description: 'List of messages in this interaction', type: [MessageDto] })
  messages: MessageDto[];
}