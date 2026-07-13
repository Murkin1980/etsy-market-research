import { describe, expect, it } from 'vitest';
import { runWithConcurrency } from '../src/utils/concurrency.js';

describe('runWithConcurrency', () => {
  it('runs more than one task while respecting the configured limit', async () => {
    let active = 0;
    let maximumActive = 0;

    await runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
    });

    expect(maximumActive).toBe(2);
  });
});
