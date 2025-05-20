import { ApiProperty } from '@nestjs/swagger';
import { IntentionDto } from './intention.dto';
import {
  PaginatedResponseDto,
  PaginationMetaDto,
} from '../../common/dto/paginated-response.dto';

export class PaginatedIntentionsResponseDto extends PaginatedResponseDto<IntentionDto> {
  @ApiProperty({
    description: 'List of intention items',
    type: [IntentionDto],
  })
  data: IntentionDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: PaginationMetaDto,
  })
  meta: PaginationMetaDto;
}
