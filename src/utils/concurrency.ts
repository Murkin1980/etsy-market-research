import { createChildLogger } from './logger.js';

const log = createChildLogger('concurrency');

export class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];
  private _limit: number;

  constructor(initialLimit: number) {
    this._limit = initialLimit;
  }

  get limit(): number {
    return this._limit;
  }

  setLimit(newLimit: number): void {
    this._limit = Math.max(1, newLimit);
    log.info({ newLimit: this._limit }, 'Concurrency limit changed');
    this.processQueue();
  }

  reduce(): void {
    this.setLimit(this._limit - 1);
  }

  get activeCount(): number {
    return this.running;
  }

  async acquire(): Promise<void> {
    if (this.running < this._limit) {
      this.running++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    this.processQueue();
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.running < this._limit) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const limiter = new ConcurrencyLimiter(limit);

  const promises = items.map(async (item, index) => {
    await limiter.acquire();
    try {
      await fn(item, index);
    } finally {
      limiter.release();
    }
  });

  await Promise.all(promises);
}
