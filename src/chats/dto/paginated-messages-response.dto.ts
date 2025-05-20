import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';
import { MessageDto } from './message.dto';

export class PaginatedMessagesResponseDto extends PaginatedResponseDto<MessageDto> {
  @ApiProperty({
    description: 'List of messages',
    type: [MessageDto],
  })
  data: MessageDto[];
}
