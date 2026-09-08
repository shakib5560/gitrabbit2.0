import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Registered user email address',
    example: 'jane.doe@example.com',
    format: 'email',
  })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'Str0ngP@ssw0rd!',
    format: 'password',
  })
  @IsNotEmpty()
  @IsString()
  password: string;
}
