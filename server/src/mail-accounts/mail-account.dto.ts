import {
  IsBoolean,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMailAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65_535)
  port!: number;

  @IsBoolean()
  secure!: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(320)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1_024)
  password!: string;
}

export class RevealMailPasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}
