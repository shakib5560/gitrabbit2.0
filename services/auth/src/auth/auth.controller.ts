import {
  Controller,
  Post,
  Patch,
  Body,
  Req,
  Res,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyTokenDto } from './dto/verify-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SendVerificationEmailDto } from './dto/send-verification-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotUsernameDto } from './dto/forgot-username.dto';
import {
  AuthResponseDto,
  RefreshResponseDto,
  UserProfileDto,
  VerifyTokenResponseDto,
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

  private getCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: (process.env.NODE_ENV === 'production' ? 'none' : 'lax') as
        | 'none'
        | 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    };
  }

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
    res.cookie('Refresh', refreshToken, this.getCookieOptions());
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
    res.cookie('Refresh', refreshToken, this.getCookieOptions());
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
    res.cookie('Refresh', refreshToken, this.getCookieOptions());
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
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : undefined;
    await this.authService.logout(user.sub, user.refreshToken, accessToken);
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
    res.cookie('Refresh', refreshToken, this.getCookieOptions());

    const dashboardUrl =
      process.env.DASHBOARD_URL ||
      `${process.env.FRONTEND_URL || 'https://gitrabbit.co'}/app/v2.0`;
    const acceptsHtml = req.headers.accept?.includes('text/html');
    if (acceptsHtml) {
      return res.redirect(`${dashboardUrl}?token=${accessToken}`);
    }
    return { accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Retrieves the authenticated user claims (userId, email, role, avatarUrl) decoded from the verified JWT Bearer token and current database record.',
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
  async getProfile(@Req() req: Request) {
    const user = req.user as any;
    return this.authService.getProfile(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Updates display name, email, or avatar URL of the authenticated user.',
  })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
    type: UserProfileDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Validation error or email already in use',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid Bearer JWT access token',
    type: ErrorResponseDto,
  })
  async updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const user = req.user as any;
    return this.authService.updateProfile(user.userId, dto);
  }

  @Post('verify-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify JWT token validity and role',
    description:
      'Validates an access token and returns user details and role for superadmin/admin dashboard access.',
  })
  @ApiBody({ type: VerifyTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Token verified successfully',
    type: VerifyTokenResponseDto,
  })
  async verifyToken(
    @Body() dto: VerifyTokenDto,
  ): Promise<VerifyTokenResponseDto> {
    return this.authService.verifyToken(dto.token);
  }

  @Post('send-verification-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send email verification link',
    description:
      'Dispatches an email containing a secure verification token to activate user accounts.',
  })
  @ApiBody({ type: SendVerificationEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent successfully',
    type: MessageResponseDto,
  })
  async sendVerificationEmail(@Body() dto: SendVerificationEmailDto) {
    return this.authService.sendVerificationEmail(dto.email);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify user email with token',
    description:
      'Verifies user email address and marks the account as verified.',
  })
  @ApiBody({ type: VerifyEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired verification token',
    type: ErrorResponseDto,
  })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Get('verify-email')
  @ApiOperation({
    summary: 'Verify email via direct link click',
    description:
      'Validates verification token from email link click and redirects to frontend login.',
  })
  async verifyEmailGet(
    @Query('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const loginUrl =
      process.env.LOGIN_URL ||
      `${process.env.FRONTEND_URL || 'https://www.gitrabbit.co'}/login`;
    try {
      await this.authService.verifyEmail(token);
      return res.redirect(`${loginUrl}?verified=true`);
    } catch {
      return res.redirect(`${loginUrl}?verified=false&error=invalid_token`);
    }
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request password reset email',
    description:
      'Sends a password reset token and link to the user email if an account exists.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset link sent successfully',
    type: MessageResponseDto,
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reset password using reset token',
    description:
      'Sets a new user password, verifies account ownership, and revokes previous sessions.',
  })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    type: MessageResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired password reset token, or weak password',
    type: ErrorResponseDto,
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('forgot-username')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request account username / details email',
    description:
      'Sends an email with account username and display name details to the registered email address.',
  })
  @ApiBody({ type: ForgotUsernameDto })
  @ApiResponse({
    status: 200,
    description: 'Account recovery email sent',
    type: MessageResponseDto,
  })
  async forgotUsername(@Body() dto: ForgotUsernameDto) {
    return this.authService.forgotUsername(dto.email);
  }
}
