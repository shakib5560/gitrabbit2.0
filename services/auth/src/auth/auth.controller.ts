import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  Get,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import {
  AuthResponseDto,
  RefreshResponseDto,
  UserProfileDto,
  MessageResponseDto,
  ErrorResponseDto,
} from './dto/auth-response.dto';
import type { Request, Response } from 'express';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { GithubOauthGuard } from './guards/github-oauth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a new user account',
    description:
      'Creates a new user record with a hashed password, stores and sets an HTTP-only Refresh cookie, and returns a signed JWT access token and user information.',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered and authenticated',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation failure or email already in use',
    type: ErrorResponseDto,
  })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.register(dto);
    res.cookie('Refresh', refreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken, user };
  }

  @Post('login')
  @ApiOperation({
    summary: 'Authenticate user with email and password',
    description:
      'Verifies user credentials, sets a new HTTP-only Refresh cookie, and returns a signed JWT access token and user details.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 201,
    description: 'User successfully authenticated',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation error in request body',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid email or password credentials',
    type: ErrorResponseDto,
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } =
      await this.authService.login(dto);
    res.cookie('Refresh', refreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken, user };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Issues a newly signed JWT access token and rotates the refresh token stored in the HTTP-only Refresh cookie.',
  })
  @ApiResponse({
    status: 201,
    description: 'Access token successfully refreshed',
    type: RefreshResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Refresh token missing from cookies or invalid',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - User does not exist or refresh token record revoked',
    type: ErrorResponseDto,
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as any;
    const { accessToken, refreshToken } = await this.authService.refreshTokens(
      user.sub,
      user.refreshToken,
    );
    res.cookie('Refresh', refreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken };
  }

  @UseGuards(JwtRefreshGuard)
  @Post('logout')
  @ApiOperation({
    summary: 'Log out current user',
    description:
      'Revokes the active refresh token from the database, clears the HTTP-only Refresh cookie, and concludes the session.',
  })
  @ApiResponse({
    status: 201,
    description: 'User successfully logged out',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Refresh token not found in cookies',
    type: ErrorResponseDto,
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as any;
    await this.authService.logout(user.sub, user.refreshToken);
    res.clearCookie('Refresh');
    return { message: 'Logged out successfully' };
  }

  @Get('github')
  @UseGuards(GithubOauthGuard)
  @ApiOperation({
    summary: 'Initiate GitHub OAuth flow',
    description:
      'Redirects the browser to GitHub OAuth authorization screen. Upon user authorization, GitHub redirects to /auth/github/callback.',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirects to GitHub OAuth consent page',
  })
  async githubAuth() {
    // Initiates the GitHub OAuth flow
  }

  @Get('github/callback')
  @UseGuards(GithubOauthGuard)
  @ApiOperation({
    summary: 'GitHub OAuth callback handler',
    description:
      'Handles the OAuth authorization callback from GitHub, links or creates the user profile, sets the Refresh token cookie, and returns the access token.',
  })
  @ApiResponse({
    status: 200,
    description: 'GitHub OAuth authentication successful',
    type: RefreshResponseDto,
  })
  @ApiResponse({
    status: 400,
    description:
      'Bad Request - GitHub account has no public or verified email address',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - GitHub authentication failed',
    type: ErrorResponseDto,
  })
  async githubAuthCallback(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.authService.oauthCallback(
      req.user,
    );
    res.cookie('Refresh', refreshToken, {
      httpOnly: true,
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Retrieves the authenticated user claims (userId, email, role) decoded from the verified JWT Bearer token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authenticated user profile retrieved successfully',
    type: UserProfileDto,
  })
  @ApiResponse({
    status: 401,
    description:
      'Unauthorized - Missing, expired, or invalid Bearer JWT access token',
    type: ErrorResponseDto,
  })
  getProfile(@Req() req: Request) {
    return req.user;
  }
}
