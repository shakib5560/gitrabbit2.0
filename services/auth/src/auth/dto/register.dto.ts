import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({
    description: 'Full name of the user',
    example: 'Jane Doe',
  })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Unique email address for registration and communication',
    example: 'jane.doe@example.com',
    format: 'email',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    description:
      'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one digit',
    example: 'Str0ngP@ssw0rd!',
    minLength: 8,
    format: 'password',
  })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;
}
