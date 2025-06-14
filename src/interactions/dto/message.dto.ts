import { ApiProperty } from '@nestjs/swagger';

export class MessageDto {
  @ApiProperty({ description: 'Message ID' })
  id: string;

  @ApiProperty({ description: 'Message text content', nullable: true })
  text: string | null;

  @ApiProperty({ description: 'Role of the sender (e.g., user, agent)' })
  role: string;

  @ApiProperty({
    description: 'Name of the user if role is user',
    nullable: true,
    required: false,
  })
  userName?: string | null;

  @ApiProperty({ description: 'Timestamp when the message was created' })
  createdAt: Date; // Using Date type, adjust if string is strictly needed
}
