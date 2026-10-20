import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

describe('AppController', () => {
  let appController: AppController;
  let mockPrisma: any;
  let mockRedis: any;
  let mockStatus: jest.Mock;
  let mockResponse: Response;

  beforeEach(async () => {
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ 1: 1 }]),
    };
    mockRedis = {
      getClient: jest.fn().mockReturnValue({
        ping: jest.fn().mockResolvedValue('PONG'),
      }),
    };
    mockStatus = jest.fn().mockReturnThis();
    mockResponse = {
      status: mockStatus,
    } as unknown as Response;

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return status ok when database and redis are healthy', async () => {
      const res = await appController.getHealth(mockResponse);
      expect(res.status).toBe('ok');
      expect(res.database).toBe('ok');
      expect(res.redis).toBe('ok');
      expect(mockStatus).not.toHaveBeenCalled();
    });

    it('should return 503 when database is unreachable', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection refused'));
      const res = await appController.getHealth(mockResponse);
      expect(res.status).toBe('error');
      expect(res.database).toContain('Connection refused');
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });

    it('should return 503 when redis ping fails', async () => {
      mockRedis.getClient().ping.mockRejectedValue(new Error('Redis timeout'));
      const res = await appController.getHealth(mockResponse);
      expect(res.status).toBe('error');
      expect(res.redis).toContain('Redis timeout');
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    });
  });
});
