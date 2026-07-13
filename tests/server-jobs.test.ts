import { describe, expect, it } from 'vitest';
import { JobManager, JobQueueFullError, type ResearchJob } from '../src/server-jobs.js';
import { parseResearchJobRequest, type RunResultPayload } from '../src/server-api.js';

const completedResult = (query: string): RunResultPayload => ({
  status: 'completed',
  query,
  runDir: `data/runs/${query}`,
  totalFound: 1,
  successCount: 1,
  partialCount: 0,
  failedCount: 0,
  blockedCount: 0,
  averagePriceUsd: 10,
  medianPriceUsd: 10,
  durationMs: 25,
});

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('API job lifecycle', () => {
  it('limits concurrency, reports queue position, and drains queued work', async () => {
    const resolvers = new Map<string, (result: RunResultPayload) => void>();
    let nextId = 0;
    const manager = new JobManager({
      maxConcurrent: 1,
      maxQueued: 1,
      maxRetained: 10,
      createId: () => `job-${++nextId}`,
      execute: (job) => new Promise((resolve) => resolvers.set(job.id, resolve)),
    });

    const first = manager.enqueue(parseResearchJobRequest({ query: 'first' }));
    const second = manager.enqueue(parseResearchJobRequest({ query: 'second' }));

    expect(first.job.status).toBe('running');
    expect(first.queuePosition).toBe(0);
    expect(second.job.status).toBe('queued');
    expect(second.queuePosition).toBe(1);
    expect(manager.stats()).toEqual({ active: 1, queued: 1, retained: 2 });
    expect(() => manager.enqueue(parseResearchJobRequest({ query: 'third' })))
      .toThrow(JobQueueFullError);

    resolvers.get(first.job.id)?.(completedResult('first'));
    await flush();

    expect(first.job.status).toBe('completed');
    expect(second.job.status).toBe('running');
    expect(manager.stats()).toEqual({ active: 1, queued: 0, retained: 2 });

    resolvers.get(second.job.id)?.(completedResult('second'));
    await flush();
    expect(second.job.status).toBe('completed');
    expect(manager.stats().active).toBe(0);
  });

  it('records executor failures and failed structured results', async () => {
    const manager = new JobManager({
      maxConcurrent: 2,
      maxQueued: 2,
      maxRetained: 10,
      createId: (() => {
        let id = 0;
        return () => `failure-${++id}`;
      })(),
      execute: async (job: ResearchJob) => {
        if (job.query === 'throws') throw new Error('child process crashed');
        return { ...completedResult(job.query), status: 'failed', error: 'blocked by fixture' };
      },
    });

    const crashed = manager.enqueue(parseResearchJobRequest({ query: 'throws' })).job;
    const failed = manager.enqueue(parseResearchJobRequest({ query: 'failed-result' })).job;
    await flush();

    expect(crashed).toMatchObject({ status: 'failed', error: 'child process crashed' });
    expect(failed).toMatchObject({ status: 'failed', error: 'blocked by fixture' });
    expect(failed.completedAt).toBeDefined();
  });

  it('retains only the configured number of terminal jobs', async () => {
    let nextId = 0;
    const manager = new JobManager({
      maxConcurrent: 1,
      maxQueued: 1,
      maxRetained: 1,
      createId: () => `retained-${++nextId}`,
      execute: async (job) => completedResult(job.query),
    });

    manager.enqueue(parseResearchJobRequest({ query: 'old' }));
    await flush();
    const newest = manager.enqueue(parseResearchJobRequest({ query: 'new' })).job;
    await flush();

    expect(manager.list()).toEqual([newest]);
    expect(manager.get('retained-1')).toBeUndefined();
  });

  it('accepts immediate work when queued capacity is zero', () => {
    const manager = new JobManager({
      maxConcurrent: 1,
      maxQueued: 0,
      maxRetained: 1,
      createId: () => 'no-queue-job',
      execute: () => new Promise(() => undefined),
    });

    const first = manager.enqueue(parseResearchJobRequest({ query: 'immediate' }));
    expect(first.job.status).toBe('running');
    expect(() => manager.enqueue(parseResearchJobRequest({ query: 'rejected' })))
      .toThrow(JobQueueFullError);
  });
});
