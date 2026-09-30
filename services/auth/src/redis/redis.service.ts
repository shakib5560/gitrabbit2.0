import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private readonly redisUrl: string;

  constructor() {
    this.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    this.client = new Redis(this.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    });

    this.client.on('connect', () => {
      this.logger.log('Redis client connecting...');
    });

    this.client.on('ready', () => {
      this.logger.log(`Redis connected and ready at ${this.redisUrl.replace(/:[^:]*@/, ':***@')}`);
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection error: ${err.message}`);
    });
  }

  async onModuleInit() {
    try {
      const pong = await this.client.ping();
      this.logger.log(`Redis health check passed: ${pong}`);
    } catch (err: any) {
      this.logger.warn(`Initial Redis ping failed: ${err.message}. Will retry automatically.`);
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
      this.logger.log('Redis client disconnected gracefully.');
    } catch {
      this.client.disconnect();
    }
  }

  /**
   * Returns the underlying primary ioredis client
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Creates a duplicate client instance (required for Socket.IO Redis pub/sub adapter)
   */
  createDuplicateClient(): Redis {
    return this.client.duplicate();
  }

  // ─── Basic Key-Value Operations ───

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const count = await this.client.exists(key);
    return count > 0;
  }

  // ─── Token Blacklisting (Instant Revocation) ───

  /**
   * Blacklist a token identifier (e.g. SHA-256 hash of access token or JTI)
   */
  async blacklistToken(tokenIdentifier: string, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) return;
    const key = `blacklist:token:${tokenIdentifier}`;
    await this.client.set(key, '1', 'EX', ttlSeconds);
    this.logger.debug(`Token blacklisted in Redis: ${key} for ${ttlSeconds}s`);
  }

  /**
   * Check if a token identifier has been blacklisted
   */
  async isTokenBlacklisted(tokenIdentifier: string): Promise<boolean> {
    const key = `blacklist:token:${tokenIdentifier}`;
    return this.exists(key);
  }

  // ─── User Profile Caching ───

  async getCachedUserProfile<T = any>(userId: string): Promise<T | null> {
    const data = await this.client.get(`cache:user:${userId}`);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  async setCachedUserProfile(userId: string, profile: any, ttlSeconds = 900): Promise<void> {
    const key = `cache:user:${userId}`;
    await this.client.set(key, JSON.stringify(profile), 'EX', ttlSeconds);
  }

  async invalidateUserProfile(userId: string): Promise<void> {
    await this.client.del(`cache:user:${userId}`);
  }

  // ─── Realtime User Presence ───

  /**
   * Set user presence status with a 60-second heartbeat TTL
   */
  async setUserPresence(
    userId: string,
    status: 'online' | 'away' | 'offline',
    ttlSeconds = 60,
  ): Promise<void> {
    const key = `presence:user:${userId}`;
    if (status === 'offline') {
      await this.client.del(key);
      await this.client.srem('presence:active_users', userId);
    } else {
      await this.client.set(key, status, 'EX', ttlSeconds);
      await this.client.sadd('presence:active_users', userId);
    }
  }

  async getUserPresence(userId: string): Promise<string | null> {
    return this.client.get(`presence:user:${userId}`);
  }

  async getActiveUserIds(): Promise<string[]> {
    return this.client.smembers('presence:active_users');
  }

  // ─── Sliding Window Rate Limiter ───

  /**
   * Fast Redis atomic rate limiter
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const clearBefore = now - windowSeconds * 1000;
    const redisKey = `ratelimit:${key}`;

    const multi = this.client.multi();
    multi.zremrangebyscore(redisKey, 0, clearBefore);
    multi.zadd(redisKey, now, `${now}-${Math.random()}`);
    multi.zcard(redisKey);
    multi.expire(redisKey, windowSeconds);

    const results = await multi.exec();
    const currentCount = (results?.[2]?.[1] as number) || 0;

    const allowed = currentCount <= limit;
    const remaining = Math.max(0, limit - currentCount);
    const resetTime = Math.ceil((now + windowSeconds * 1000) / 1000);

    return { allowed, remaining, resetTime };
  }
}
