import { IsArray, IsOptional } from 'class-validator';

export class UpdateUserPermissionsDto {
  @IsArray()
  @IsOptional()
  permissions: {
    allowed?: boolean;
    resource: string;
    action: string;
  }[];
}