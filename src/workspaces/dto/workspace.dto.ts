import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class WorkspaceDto {
  @ApiProperty({
    description: 'Workspace unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  @IsNotEmpty()
  id: string;

  @ApiProperty({
    description: 'Workspace name',
    example: 'My Workspace',
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}
