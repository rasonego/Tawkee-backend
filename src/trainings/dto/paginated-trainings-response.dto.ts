import { ApiProperty } from '@nestjs/swagger';
import { TrainingDto } from './training.dto';
import {
  PaginatedResponseDto,
  PaginationMetaDto,
} from '../../common/dto/paginated-response.dto';

export class PaginatedTrainingsResponseDto extends PaginatedResponseDto<TrainingDto> {
  @ApiProperty({ type: [TrainingDto] })
  data: TrainingDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
