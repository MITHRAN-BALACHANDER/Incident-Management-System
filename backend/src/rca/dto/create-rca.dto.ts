import { IsISO8601, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateRcaDto {
  @IsUUID()
  workItemId: string;

  @IsString()
  @IsNotEmpty()
  rootCause: string;

  @IsString()
  @IsNotEmpty()
  fixApplied: string;

  @IsString()
  @IsNotEmpty()
  preventionSteps: string;

  @IsISO8601({}, { message: 'startTime must be a valid ISO 8601 date string' })
  startTime: string;

  @IsISO8601({}, { message: 'endTime must be a valid ISO 8601 date string' })
  endTime: string;
}
