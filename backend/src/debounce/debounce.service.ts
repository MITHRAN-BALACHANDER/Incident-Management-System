import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import Redlock from 'redlock';
import { Severity } from '../common/enums/severity.enum';
import { getDebounceWindowSeconds } from '../common/utils/debounce-window.util';

@Injectable()
export class DebounceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DebounceService.name);
  private redis: Redis;
  private redlock: Redlock;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD'),
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.redis.on('connect', () => this.logger.log('Redis connected'));
    this.redis.on('error', (err) => this.logger.error(`Redis error: ${err.message}`));

    this.redlock = new Redlock([this.redis], {
      driftFactor: 0.01,
      retryCount: 10,
      retryDelay: 200,
      retryJitter: 200,
    });
    this.redlock.on('clientError', (err) => this.logger.error(`Redlock error: ${err.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }

  /**
   * Add a signal to the sliding debounce window for a given componentId.
   *
   * Strategy:
   * - RPUSH signalId into list key
   * - If key is NEW (RPUSH returns 1) → this is the first signal in the window
   * - EXPIRE with severity-based TTL (sliding window: reset on each signal)
   *
   * Returns { isNew: true } when a new window is opened → caller should
   * schedule a flush job delayed by TTL.
   */
  async addSignal(
    componentId: string,
    signalId: string,
    severity: Severity,
  ): Promise<{ isNew: boolean; ttlSeconds: number }> {
    const key = `debounce:${componentId}`;
    const ttlSeconds = getDebounceWindowSeconds(severity);

    const pipeline = this.redis.pipeline();
    pipeline.rpush(key, signalId);
    pipeline.expire(key, ttlSeconds);
    const results = await pipeline.exec();

    // results[0][1] = RPUSH return value (length after push)
    const listLength = results?.[0]?.[1] as number;
    const isNew = listLength === 1;

    this.logger.debug(
      `Debounce window [${componentId}]: signalId=${signalId}, length=${listLength}, ttl=${ttlSeconds}s, isNew=${isNew}`,
    );

    return { isNew, ttlSeconds };
  }

  /**
   * Flush the window: atomically get all signalIds and delete the key.
   * Returns an empty array if window already expired or was already flushed.
   */
  async flushWindow(componentId: string): Promise<string[]> {
    const key = `debounce:${componentId}`;
    const pipeline = this.redis.pipeline();
    pipeline.lrange(key, 0, -1);
    pipeline.del(key);
    const results = await pipeline.exec();

    const signalIds = (results?.[0]?.[1] as string[]) ?? [];
    this.logger.log(
      `Flushed debounce window [${componentId}]: ${signalIds.length} signal(s)`,
    );
    return signalIds;
  }

  /**
   * Check if a debounce window is currently active (key exists).
   */
  async isWindowActive(componentId: string): Promise<boolean> {
    const exists = await this.redis.exists(`debounce:${componentId}`);
    return exists === 1;
  }

  /**
   * Store active incident ID in Redis cache.
   */
  async cacheActiveIncident(workItemId: string, data: Record<string, unknown>): Promise<void> {
    await this.redis.set(
      `incident:${workItemId}`,
      JSON.stringify(data),
      'EX',
      300, // 5 min TTL
    );
  }

  /**
   * Remove incident from active cache (e.g. when CLOSED).
   */
  async evictIncidentCache(workItemId: string): Promise<void> {
    await this.redis.del(`incident:${workItemId}`);
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  getRedisClient(): Redis {
    return this.redis;
  }

  getRedlock(): Redlock {
    return this.redlock;
  }
}
