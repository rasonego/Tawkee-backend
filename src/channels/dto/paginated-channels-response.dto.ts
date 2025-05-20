import { ApiProperty } from '@nestjs/swagger';
import { ChannelDto } from './channel.dto';
import {
  PaginatedResponseDto,
  PaginationMetaDto,
} from '../../common/dto/paginated-response.dto';

export class PaginatedChannelsResponseDto extends PaginatedResponseDto<ChannelDto> {
  @ApiProperty({
    description: 'List of channel items',
    type: [ChannelDto],
  })
  data: ChannelDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: PaginationMetaDto,
  })
  meta: PaginationMetaDto;
}
