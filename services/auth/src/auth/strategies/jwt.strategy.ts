import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RedisService } from '../../redis/redis.service';
import * as crypto from 'crypto';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly redisService: RedisService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey:
        process.env.JWT_ACCESS_SECRET ||
        process.env.JWT_SECRET ||
        'zV8adrd31EFoqU6O2f3R24qYQGamxvMWIzSYwrJ4nSe',
    });
  }

  async validate(req: any, payload: any) {
    if (!payload || !payload.sub) {
      throw new UnauthorizedException();
    }

    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (token) {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const isBlacklisted =
        await this.redisService.isTokenBlacklisted(tokenHash);
      if (isBlacklisted) {
        throw new UnauthorizedException('Access token has been revoked');
      }
    }

    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}
