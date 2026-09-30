import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class ForgotUsernameDto {
  @ApiProperty({
    description: 'Email address of the account to recover username / display name for',
    example: 'alex@example.com',
  })
  @IsNotEmpty({ message: 'Email address is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}
