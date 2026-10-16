import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DATE_PATTERN } from '../../../common/service-date.js';

const MAX_PRICE = 1_000_000;
const PERMIT_REF_MAX_LENGTH = 100;

export class CreateRateDto {
  @ApiProperty({ example: 100, description: 'บาท / ช่อง / รอบ' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_PRICE)
  pricePerSlotRound: number;

  @ApiProperty({ example: '2026-11-01', description: 'วันที่เริ่มมีผล' })
  @Matches(DATE_PATTERN)
  effectiveFrom: string;

  @ApiProperty({ description: 'เลขที่หนังสืออนุญาตของบริษัท' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(PERMIT_REF_MAX_LENGTH)
  permitRef: string;
}
