import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class SendVerificationEmailDto {
  @ApiProperty({
    description: 'Email address of the user to send verification email to',
    example: 'user@example.com',
  })
  @IsNotEmpty({ message: 'Email address is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}
