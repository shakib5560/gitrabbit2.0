import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { RedisService } from '../../redis/redis.service';
import * as crypto from 'crypto';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token =
      client.handshake?.auth?.token ||
      (client.handshake?.headers?.authorization?.startsWith('Bearer ')
        ? client.handshake.headers.authorization.split(' ')[1]
        : null) ||
      (client.handshake?.query?.token as string);

    if (!token) {
      this.logger.warn(`WS connection rejected: No authentication token provided (Socket: ${client.id})`);
      return false;
    }

    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const isBlacklisted = await this.redisService.isTokenBlacklisted(tokenHash);
      if (isBlacklisted) {
        this.logger.warn(`WS connection rejected: Token revoked (Socket: ${client.id})`);
        return false;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret:
          process.env.JWT_ACCESS_SECRET ||
          process.env.JWT_SECRET ||
          'zV8adrd31EFoqU6O2f3R24qYQGamxvMWIzSYwrJ4nSe',
      });

      client.data.user = {
        userId: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      return true;
    } catch (err: any) {
      this.logger.warn(`WS connection token verification failed (Socket: ${client.id}): ${err?.message}`);
      return false;
    }
  }
}
