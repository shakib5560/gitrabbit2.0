import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Email verification token received via email',
    example: 'a9b8c7d6e5f4...',
  })
  @IsNotEmpty({ message: 'Verification token is required' })
  @IsString({ message: 'Verification token must be a string' })
  token: string;
}
