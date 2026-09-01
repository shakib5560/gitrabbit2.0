import { Injectable, BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already in use');
    }

    const hashedPassword = await this.hashData(dto.password);

    const newUser = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
      },
    });

    const tokens = await this.getTokens(newUser.id, newUser.email, newUser.role);
    await this.updateRefreshToken(newUser.id, tokens.refreshToken);
    return { ...tokens, user: { id: newUser.id, email: newUser.email, name: newUser.name } };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
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
    return { ...tokens, user: { id: user.id, email: user.email, name: user.name } };
  }

  async validateOAuthLogin(profile: any) {
    const { id, emails, displayName } = profile;
    const email = emails && emails.length > 0 ? emails[0].value : null;

    if (!email) {
      throw new BadRequestException('GitHub account has no email');
    }

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      if (!user.githubId) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { githubId: id },
        });
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          email,
          name: displayName || email.split('@')[0],
          githubId: id,
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

    const tokenRecord = await this.prisma.refreshToken.findFirst({
      where: { userId, token: refreshToken },
    });
    
    // In production we would hash refresh tokens in DB and compare. For simplicity we check exact match here since the user schema uses a raw String for token.
    if (!tokenRecord) {
      throw new ForbiddenException('Access Denied');
    }

    const tokens = await this.getTokens(user.id, user.email, user.role);
    await this.updateRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  async logout(userId: string, refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        token: refreshToken,
      },
    });
  }

  async hashData(data: string) {
    return bcrypt.hash(data, 10);
  }

  async getTokens(userId: string, email: string, role: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role },
        {
          secret: process.env.JWT_ACCESS_SECRET,
          expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any,
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, role },
        {
          secret: process.env.JWT_REFRESH_SECRET,
          expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as any,
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    const decoded = this.jwtService.decode(refreshToken) as any;
    
    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken, // We should hash this ideally, but schema has unique constraint on it and uses it directly.
        expiresAt: new Date(decoded.exp * 1000),
      }
    });
  }
}
