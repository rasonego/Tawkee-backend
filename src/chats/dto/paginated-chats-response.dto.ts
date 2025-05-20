import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { ChatDto } from './chat.dto';

export class PaginatedChatsResponseDto extends PaginatedResponseDto<ChatDto> {
  @ApiProperty({
    description: 'List of chats',
    type: [ChatDto],
  })
  data: ChatDto[];
}
