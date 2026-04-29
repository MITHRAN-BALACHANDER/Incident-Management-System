import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Severity } from '../../common/enums/severity.enum';

export class CreateSignalDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  componentId: string;

  @IsEnum(Severity, { message: 'severity must be one of P0, P1, P2' })
  severity: Severity;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  message: string;

  @IsISO8601({}, { message: 'timestamp must be a valid ISO 8601 date string' })
  timestamp: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
