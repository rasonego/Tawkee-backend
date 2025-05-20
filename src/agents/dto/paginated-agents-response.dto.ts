import { ApiProperty } from '@nestjs/swagger';
import { AgentDto } from './agent.dto';
import {
  PaginatedResponseDto,
  PaginationMetaDto,
} from '../../common/dto/paginated-response.dto';

export class PaginatedAgentsResponseDto extends PaginatedResponseDto<AgentDto> {
  @ApiProperty({
    description: 'List of agent items',
    type: [AgentDto],
  })
  data: AgentDto[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: PaginationMetaDto,
  })
  meta: PaginationMetaDto;
}
