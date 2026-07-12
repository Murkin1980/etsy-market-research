import fs from 'fs';
import path from 'path';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('cache');

export interface CacheEntry<T> {
  data: T;
  timestamp: string;
  ttlMs: number;
}

export class FileCache {
  private cacheDir: string;
  private ttlMs: number;

  constructor(cacheDir: string, ttlHours: number = 24) {
    this.cacheDir = cacheDir;
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private getFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, '_');
    return path.join(this.cacheDir, `${safeKey}.json`);
  }

  get<T>(key: string): T | null {
    const filePath = this.getFilePath(key);
    if (!fs.existsSync(filePath)) return null;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const entry: CacheEntry<T> = JSON.parse(content);
      const age = Date.now() - new Date(entry.timestamp).getTime();
      if (age > entry.ttlMs) {
        fs.unlinkSync(filePath);
        log.debug({ key, age }, 'Cache entry expired');
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  set<T>(key: string, data: T): void {
    const filePath = this.getFilePath(key);
    const entry: CacheEntry<T> = {
      data,
      timestamp: new Date().toISOString(),
      ttlMs: this.ttlMs,
    };
    try {
      fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf-8');
      log.debug({ key }, 'Cache entry saved');
    } catch (err) {
      log.warn({ key, error: (err as Error).message }, 'Failed to save cache entry');
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    try {
      const files = fs.readdirSync(this.cacheDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
      log.info('Cache cleared');
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to clear cache');
    }
  }
}
