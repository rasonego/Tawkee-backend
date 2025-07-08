import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateWorkspaceNameDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}
