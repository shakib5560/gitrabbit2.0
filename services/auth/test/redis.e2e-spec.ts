import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/redis/redis.service';

describe('RedisService (Integration)', () => {
  let app: INestApplication;
  let redisService: RedisService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    redisService = app.get<RedisService>(RedisService);
    await app.init();
  }, 30000);

  afterAll(async () => {
    await redisService.onModuleDestroy();
    await app.close();
  });

  it('should ping Redis successfully', async () => {
    const pong = await redisService.getClient().ping();
    expect(pong).toBe('PONG');
  });

  it('should set and get basic keys with TTL', async () => {
    const testKey = `test:key:${Date.now()}`;
    await redisService.set(testKey, 'hello-gitrabbit', 10);
    const val = await redisService.get(testKey);
    expect(val).toBe('hello-gitrabbit');

    await redisService.del(testKey);
    const deletedVal = await redisService.get(testKey);
    expect(deletedVal).toBeNull();
  });

  it('should blacklist a token and verify revocation', async () => {
    const fakeTokenHash = `tok_hash_${Date.now()}`;
    expect(await redisService.isTokenBlacklisted(fakeTokenHash)).toBe(false);

    await redisService.blacklistToken(fakeTokenHash, 60);
    expect(await redisService.isTokenBlacklisted(fakeTokenHash)).toBe(true);
  });

  it('should cache and invalidate user profile', async () => {
    const testUserId = `user_${Date.now()}`;
    const profile = {
      name: 'Test User',
      email: 'test@gitrabbit.co',
      role: 'ADMIN',
    };

    await redisService.setCachedUserProfile(testUserId, profile, 60);
    const cached = await redisService.getCachedUserProfile(testUserId);
    expect(cached).toEqual(profile);

    await redisService.invalidateUserProfile(testUserId);
    const invalidated = await redisService.getCachedUserProfile(testUserId);
    expect(invalidated).toBeNull();
  });

  it('should manage user presence in Redis', async () => {
    const testUserId = `presence_user_${Date.now()}`;
    await redisService.setUserPresence(testUserId, 'online', 60);
    expect(await redisService.getUserPresence(testUserId)).toBe('online');

    await redisService.setUserPresence(testUserId, 'away', 60);
    expect(await redisService.getUserPresence(testUserId)).toBe('away');

    await redisService.setUserPresence(testUserId, 'offline');
    expect(await redisService.getUserPresence(testUserId)).toBeNull();
  });

  it('should enforce sliding window rate limiting', async () => {
    const rateLimitKey = `test_rl_${Date.now()}`;
    // Limit = 3 requests per 5 seconds
    const r1 = await redisService.checkRateLimit(rateLimitKey, 3, 5);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await redisService.checkRateLimit(rateLimitKey, 3, 5);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await redisService.checkRateLimit(rateLimitKey, 3, 5);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = await redisService.checkRateLimit(rateLimitKey, 3, 5);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });
});
