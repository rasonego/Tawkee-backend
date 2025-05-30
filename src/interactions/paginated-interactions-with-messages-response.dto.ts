import { ApiProperty } from '@nestjs/swagger';
import { InteractionWithMessagesDto } from './dto/interaction-with-messages.dto';
import { PaginationMetaDto } from '../common/dto/paginated-response.dto';

export class PaginatedInteractionsWithMessagesResponseDto {
  @ApiProperty({
    description: 'List of interactions with their messages for the current page',
    type: [InteractionWithMessagesDto],
  })
  data: InteractionWithMessagesDto[];

  @ApiProperty({ description: 'Pagination metadata' })
  meta: PaginationMetaDto;
}

// You might need to create or adjust PaginationMetaDto if it doesn't exist
// Example PaginationMetaDto:
/*
export class PaginationMetaDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  totalPages: number;
}
*/

