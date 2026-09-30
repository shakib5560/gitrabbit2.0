import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TokenType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private mailService: MailService,
    private redisService: RedisService,
  ) {}

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async createAndSendVerificationToken(userId: string, email: string, name: string) {
    await this.prisma.verificationToken.deleteMany({
      where: { userId, type: TokenType.EMAIL_VERIFICATION },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.verificationToken.create({
      data: {
        token,
        type: TokenType.EMAIL_VERIFICATION,
        userId,
        expiresAt,
      },
    });

    this.mailService.sendVerificationEmail(email, name, token).catch(() => {});
    return token;
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    const hashedPassword = await this.hashData(dto.password);

    const newUser = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.toLowerCase().trim(),
        password: hashedPassword,
        isEmailVerified: false,
      },
    });

    await this.createAndSendVerificationToken(newUser.id, newUser.email, newUser.name);

    const tokens = await this.getTokens(newUser.id, newUser.email, newUser.role);
    await this.updateRefreshToken(newUser.id, tokens.refreshToken);
    return {
      ...tokens,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        avatarUrl: newUser.avatarUrl,
        isEmailVerified: newUser.isEmailVerified,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isEmailVerified: user.isEmailVerified,
      },
    };
  }

  async validateOAuthLogin(profile: any) {
    const { id, emails, displayName, photos } = profile;
    const email = emails && emails.length > 0 ? emails[0].value.toLowerCase().trim() : null;
    const avatarUrl =
      photos && photos.length > 0
        ? photos[0].value
        : profile._json?.avatar_url || null;

    if (!email) {
      throw new BadRequestException('GitHub account has no public or verified email address');
    }

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          githubId: id,
          isEmailVerified: true,
          ...(avatarUrl && !user.avatarUrl ? { avatarUrl } : {}),
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          name: displayName || profile.username || email.split('@')[0],
          githubId: id,
          avatarUrl,
          isEmailVerified: true,
        },
      });
    }

    return user;
  }

  async oauthCallback(user: any) {
    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new ForbiddenException('Access Denied');

    const tokenHash = this.hashToken(refreshToken);

    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        token: { in: [tokenHash, refreshToken] },
      },
    });

    if (!tokenRecord || new Date() > tokenRecord.expiresAt) {
      if (tokenRecord) {
        await this.prisma.refreshToken.delete({ where: { id: tokenRecord.id } });
      }
      throw new ForbiddenException('Access Denied: Invalid or expired refresh token');
    }

    // Revoke previous token before issuing a new one (Token Rotation)
    await this.prisma.refreshToken.delete({
      where: { id: tokenRecord.id },
    });

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string, refreshToken?: string, accessToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
          token: { in: [tokenHash, refreshToken] },
        },
      });
    }

    if (accessToken) {
      const accessHash = this.hashToken(accessToken);
      await this.redisService.blacklistToken(accessHash, 1500);
    }

    await this.redisService.invalidateUserProfile(userId);
  }

  async sendVerificationEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return { message: 'If this email is registered, a verification link has been sent.' };
    }

    if (user.isEmailVerified) {
      return { message: 'Email address is already verified.' };
    }

    await this.createAndSendVerificationToken(user.id, user.email, user.name);
    return { message: 'Verification email has been sent successfully.' };
  }

  async verifyEmail(token: string) {
    const tokenRecord = await this.prisma.verificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (
      !tokenRecord ||
      tokenRecord.type !== TokenType.EMAIL_VERIFICATION ||
      new Date() > tokenRecord.expiresAt
    ) {
      if (tokenRecord) {
        await this.prisma.verificationToken.delete({ where: { id: tokenRecord.id } });
      }
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: tokenRecord.userId },
      data: { isEmailVerified: true },
    });

    await this.prisma.verificationToken.delete({
      where: { id: tokenRecord.id },
    });

    return {
      success: true,
      message: 'Email verified successfully. You can now access all features.',
    };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return { message: 'If this email is registered, a password reset link has been sent.' };
    }

    await this.prisma.verificationToken.deleteMany({
      where: { userId: user.id, type: TokenType.PASSWORD_RESET },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.verificationToken.create({
      data: {
        token,
        type: TokenType.PASSWORD_RESET,
        userId: user.id,
        expiresAt,
      },
    });

    this.mailService
      .sendPasswordResetEmail(user.email, user.name, token)
      .catch((err) => this.mailService['logger']?.error?.(err));

    return { message: 'If this email is registered, a password reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenRecord = await this.prisma.verificationToken.findUnique({
      where: { token: dto.token },
    });

    if (
      !tokenRecord ||
      tokenRecord.type !== TokenType.PASSWORD_RESET ||
      new Date() > tokenRecord.expiresAt
    ) {
      if (tokenRecord) {
        await this.prisma.verificationToken.delete({ where: { id: tokenRecord.id } });
      }
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const hashedPassword = await this.hashData(dto.newPassword);

    await this.prisma.user.update({
      where: { id: tokenRecord.userId },
      data: {
        password: hashedPassword,
        isEmailVerified: true,
      },
    });

    await this.prisma.verificationToken.delete({
      where: { id: tokenRecord.id },
    });

    await this.prisma.refreshToken.deleteMany({
      where: { userId: tokenRecord.userId },
    });

    await this.redisService.invalidateUserProfile(tokenRecord.userId);

    return {
      success: true,
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }

  async forgotUsername(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (user) {
      this.mailService
        .sendForgotUsernameEmail(user.email, user.name)
        .catch((err) => this.mailService['logger']?.error?.(err));
    }

    return {
      message: 'If this email is registered, your username/account details have been sent.',
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    if (dto.email && dto.email.toLowerCase().trim() !== user.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase().trim() },
      });
      if (emailExists) {
        throw new BadRequestException('Email is already registered by another user');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.email ? { email: dto.email.toLowerCase().trim() } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
    });

    await this.redisService.invalidateUserProfile(userId);

    return {
      userId: updatedUser.id,
      email: updatedUser.email,
      name: updatedUser.name,
      avatarUrl: updatedUser.avatarUrl,
      isEmailVerified: updatedUser.isEmailVerified,
      role: updatedUser.role,
    };
  }

  async getProfile(userId: string) {
    const cached = await this.redisService.getCachedUserProfile(userId);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const profile = {
      userId: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      isEmailVerified: user.isEmailVerified,
      role: user.role,
    };

    await this.redisService.setCachedUserProfile(userId, profile, 900);
    return profile;
  }

  async verifyToken(token: string) {
    try {
      const tokenHash = this.hashToken(token);
      const isBlacklisted = await this.redisService.isTokenBlacklisted(tokenHash);
      if (isBlacklisted) {
        return { valid: false, error: 'Token has been revoked' };
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret:
          process.env.JWT_ACCESS_SECRET ||
          process.env.JWT_SECRET ||
          'zV8adrd31EFoqU6O2f3R24qYQGamxvMWIzSYwrJ4nSe',
      });

      if (!payload || !payload.sub) {
        return { valid: false };
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        return { valid: false };
      }

      return {
        valid: true,
        role: user.role,
        user: {
          userId: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
          isEmailVerified: user.isEmailVerified,
          role: user.role,
        },
      };
    } catch {
      return { valid: false };
    }
  }

  async hashData(data: string) {
    return bcrypt.hash(data, 10);
  }

  async getTokens(userId: string, email: string, role: string) {
    const accessSecret =
      process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_SECRET ||
      'zV8adrd31EFoqU6O2f3R24qYQGamxvMWIzSYwrJ4nSe';
    const refreshSecret =
      process.env.JWT_REFRESH_SECRET ||
      'vv28495Plf2yFXBt9XiPYuC2KI7o5SokPS1qceFFqbr';

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role },
        {
          secret: accessSecret,
          expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '25m') as any,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, role },
        {
          secret: refreshSecret,
          expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    const decoded = this.jwtService.decode(refreshToken) as any;
    const tokenHash = this.hashToken(refreshToken);

    const expiresAt =
      decoded && decoded.exp
        ? new Date(decoded.exp * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: tokenHash,
        expiresAt,
      },
    });
  }
}
