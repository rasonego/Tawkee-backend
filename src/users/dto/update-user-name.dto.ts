import { IsString } from 'class-validator';

export class UpdateUserNameDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;
}
