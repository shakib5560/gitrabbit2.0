import { Controller, Get, Res, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Auth service greeting',
    description:
      'Returns a greeting string confirming that the auth service is running.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy and responding',
    schema: {
      type: 'string',
      example: 'Hello World!',
    },
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get(['health', 'auth/health'])
  @ApiOperation({
    summary: 'Auth service health check',
    description:
      'Verifies Auth Service process status, PostgreSQL database connectivity, and Redis cache responsiveness.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service and all dependencies are healthy',
  })
  @ApiResponse({
    status: 503,
    description: 'Service degraded or downstream dependency unreachable',
  })
  async getHealth(@Res({ passthrough: true }) res: Response) {
    let dbStatus = 'ok';
    let redisStatus = 'ok';
    let isHealthy = true;

    try {
      await this.prismaService.$queryRaw`SELECT 1`;
    } catch (e: any) {
      dbStatus = `error: ${e?.message || 'Database unreachable'}`;
      isHealthy = false;
    }

    try {
      const pong: string = await this.redisService.getClient().ping();
      if (pong !== 'PONG') {
        redisStatus = 'unexpected ping response';
        isHealthy = false;
      }
    } catch (e: any) {
      redisStatus = `error: ${e?.message || 'Redis unreachable'}`;
      isHealthy = false;
    }

    if (!isHealthy) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'error',
        service: 'auth-service',
        database: dbStatus,
        redis: redisStatus,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      status: 'ok',
      service: 'auth-service',
      database: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    };
  }
}
