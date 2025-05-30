import { ApiProperty } from '@nestjs/swagger';
import { Message } from '@prisma/client';

export class ChatDto {
  @ApiProperty({
    description: 'Indicates if the chat is being handled by a human',
    example: true,
  })
  humanTalk: boolean;

  @ApiProperty({
    description: 'Profile picture of the user who took over the chat',
    example: 'https://example.com/profile.jpg',
    nullable: true,
  })
  userPicture: string | null;

  @ApiProperty({
    description: 'Name of the user who sent the message',
    example: 'John Doe',
  })
  messageUserName: string;

  @ApiProperty({
    description: 'Indicates if the chat has been read',
    example: true,
  })
  read: boolean;

  @ApiProperty({
    description: 'Role in the chat',
    example: 'user',
  })
  role: string;

  @ApiProperty({
    description: 'Name of the agent',
    example: 'Customer Support Bot',
  })
  agentName: string;

  @ApiProperty({
    description: 'ID of the agent',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  agentId: string;

  @ApiProperty({
    description: 'WhatsApp phone number',
    example: '+1234567890',
  })
  whatsappPhone: string;

  @ApiProperty({
    description: 'Indicates if the chat is finished',
    example: false,
  })
  finished: boolean;

  @ApiProperty({
    description: 'Avatar of the assistant',
    example: 'https://example.com/avatar.png',
  })
  avatar: string;

  @ApiProperty({
    description: 'Title of the chat',
    example: 'Support Request',
  })
  title: string;

  @ApiProperty({
    description: 'Type of chat',
    example: 'support',
  })
  type: string;

  @ApiProperty({
    description: 'Name of the user',
    example: 'Jane Smith',
  })
  userName: string;

  @ApiProperty({
    description: 'ID of the user',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  userId: string;

  @ApiProperty({
    description: 'Picture associated with the chat',
    example: 'https://example.com/chat-image.jpg',
  })
  picture: string;

  @ApiProperty({
    description: 'Type of conversation',
    example: 'direct',
  })
  conversationType: string;

  @ApiProperty({
    description: 'Creation timestamp',
    example: 1619712345678,
  })
  createdAt: number;

  @ApiProperty({
    description: 'Name of the chat',
    example: 'Product inquiry',
  })
  name: string;

  @ApiProperty({
    description: 'Recipient of the chat',
    example: 'John Doe',
  })
  recipient: string;

  @ApiProperty({
    description: 'ID of the chat',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Timestamp of the last message',
    example: 1619712345678,
  })
  time: number;

  @ApiProperty({
    description: 'Count of unread messages',
    example: 3,
  })
  unReadCount: number;

  @ApiProperty({
    description: 'Conversation content',
    example: 'Hello, how can I help you?',
  })
  conversation: string;

  @ApiProperty({
    description: 'Latest message',
    example: 'Yes, thanks...'
  })
  latestMessage?: Message;
}
