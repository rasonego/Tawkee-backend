// src/common/decorators/permission.decorator.ts
import { applyDecorators, SetMetadata } from '@nestjs/common';

export const Permission = (action: string, resource: string) => {
  return applyDecorators(
    SetMetadata('action', action),
    SetMetadata('resource', resource)
  );
};
