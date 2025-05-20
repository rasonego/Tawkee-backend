import { ApiProperty } from '@nestjs/swagger';
import { InteractionDto } from './interaction.dto';
import {
  PaginatedResponseDto,
  PaginationMetaDto,
} from '../../common/dto/paginated-response.dto';

export class PaginatedInteractionsResponseDto extends PaginatedResponseDto<InteractionDto> {
  @ApiProperty({ type: [InteractionDto] })
  data: InteractionDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
