import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';

export function ApiPaginationQueries() {
  return applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      description: 'Page number, starts from 1',
      example: 1,
    }),
    ApiQuery({
      name: 'pageSize',
      required: false,
      type: Number,
      description: 'Number of items per page',
      example: 10,
    }),
    ApiQuery({
      name: 'query',
      required: false,
      type: String,
      description: 'Search query string',
    })
  );
}
