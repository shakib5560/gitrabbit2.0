import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class UserResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the user (UUID)',
    example: 'd9b3a971-e630-4e31-8fcb-2b49bca74e0d',
  })
  id: string;

  @ApiProperty({
    description: 'Full name of the user',
    example: 'Jane Doe',
  })
  name: string;

  @ApiProperty({
    description: 'Unique email address of the user',
    example: 'jane.doe@example.com',
  })
  email: string;
}

export class AuthResponseDto {
  @ApiProperty({
    description:
      'Signed JWT Bearer access token used for authorizing subsequent requests (expires in ~15-25m)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Basic public information of the authenticated user',
    type: () => UserResponseDto,
  })
  user: UserResponseDto;
}

export class RefreshResponseDto {
  @ApiProperty({
    description: 'Newly generated JWT Bearer access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;
}

export class UserProfileDto {
  @ApiProperty({
    description: 'User identifier (sub from JWT token)',
    example: 'd9b3a971-e630-4e31-8fcb-2b49bca74e0d',
  })
  userId: string;

  @ApiProperty({
    description: 'Email address extracted from the JWT token',
    example: 'jane.doe@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User access role',
    enum: Role,
    example: Role.USER,
  })
  role: Role;
}

export class MessageResponseDto {
  @ApiProperty({
    description: 'Informational status message',
    example: 'Logged out successfully',
  })
  message: string;
}

export class ErrorResponseDto {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode: number;

  @ApiProperty({
    description: 'Error message details',
    oneOf: [
      { type: 'string', example: 'Email already in use' },
      {
        type: 'array',
        items: { type: 'string' },
        example: [
          'Password must contain at least one uppercase letter, one lowercase letter, and one number',
        ],
      },
    ],
  })
  message: string | string[];

  @ApiPropertyOptional({
    description: 'HTTP error title',
    example: 'Bad Request',
  })
  error?: string;
}
