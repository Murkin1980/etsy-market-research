import { createChildLogger } from './logger.js';

const log = createChildLogger('retry');

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

export class RetryError extends Error {
  constructor(
    message: string,
    public readonly attempts: number,
    public readonly lastError: Error,
  ) {
    super(message);
    this.name = 'RetryError';
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  context?: string,
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs = 30000, backoffMultiplier = 2 } = options;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt > maxRetries) {
        break;
      }

      const delayMs = Math.min(baseDelayMs * Math.pow(backoffMultiplier, attempt - 1), maxDelayMs);
      log.warn(
        {
          attempt,
          maxRetries,
          delayMs,
          context,
          error: lastError.message,
        },
        `Retry attempt ${attempt}/${maxRetries} after ${delayMs}ms`,
      );

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new RetryError(
    `Failed after ${maxRetries + 1} attempts: ${context ?? 'unknown'}`,
    maxRetries + 1,
    lastError!,
  );
}
