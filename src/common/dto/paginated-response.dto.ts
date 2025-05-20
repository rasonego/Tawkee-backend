import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({
    description: 'Total number of items',
    type: Number,
    example: 100,
  })
  total: number;

  @ApiProperty({
    description: 'Current page',
    type: Number,
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    type: Number,
    example: 10,
  })
  pageSize: number;

  @ApiProperty({
    description: 'Total number of pages',
    type: Number,
    example: 10,
  })
  totalPages: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({
    description: 'List of items',
    isArray: true,
  })
  data: T[];

  @ApiProperty({
    description: 'Pagination metadata',
    type: PaginationMetaDto,
  })
  meta: PaginationMetaDto;
}
