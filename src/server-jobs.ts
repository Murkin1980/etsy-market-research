import { randomUUID } from 'crypto';
import type { ResearchJobRequest, RunResultPayload } from './server-api.js';

export type ResearchJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ResearchJob {
  id: string;
  query: string;
  request: ResearchJobRequest;
  status: ResearchJobStatus;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: RunResultPayload;
  error?: string;
}

export type JobExecutor = (job: ResearchJob) => Promise<RunResultPayload>;

export interface JobManagerOptions {
  maxConcurrent: number;
  maxQueued: number;
  maxRetained: number;
  execute: JobExecutor;
  createId?: () => string;
  now?: () => string;
}

export class JobQueueFullError extends Error {
  constructor(public readonly maxQueued: number) {
    super(`Job queue is full (maximum ${maxQueued})`);
    this.name = 'JobQueueFullError';
  }
}

export class JobManager {
  private readonly queuedJobs: ResearchJob[] = [];
  private readonly activeJobIds = new Set<string>();
  private readonly retainedJobs: ResearchJob[] = [];
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(private readonly options: JobManagerOptions) {
    if (options.maxConcurrent < 1 || options.maxQueued < 0 || options.maxRetained < 0) {
      throw new Error('Invalid job manager limits');
    }
    this.createId = options.createId ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  enqueue(request: ResearchJobRequest): { job: ResearchJob; queuePosition: number } {
    const allSlotsBusy = this.activeJobIds.size >= this.options.maxConcurrent;
    if (allSlotsBusy && this.queuedJobs.length >= this.options.maxQueued) {
      throw new JobQueueFullError(this.options.maxQueued);
    }

    const availableSlots = Math.max(0, this.options.maxConcurrent - this.activeJobIds.size);
    const queuePosition = Math.max(0, this.queuedJobs.length + 1 - availableSlots);
    const job: ResearchJob = {
      id: this.createId(),
      query: request.query,
      request,
      status: 'queued',
      queuedAt: this.now(),
    };

    this.retainedJobs.push(job);
    this.queuedJobs.push(job);
    this.processQueue();
    return { job, queuePosition };
  }

  get(jobId: string): ResearchJob | undefined {
    return this.retainedJobs.find((job) => job.id === jobId);
  }

  list(): ResearchJob[] {
    return [...this.retainedJobs];
  }

  stats(): { active: number; queued: number; retained: number } {
    return {
      active: this.activeJobIds.size,
      queued: this.queuedJobs.length,
      retained: this.retainedJobs.length,
    };
  }

  private processQueue(): void {
    while (
      this.activeJobIds.size < this.options.maxConcurrent &&
      this.queuedJobs.length > 0
    ) {
      const job = this.queuedJobs.shift();
      if (job) void this.startJob(job);
    }
  }

  private async startJob(job: ResearchJob): Promise<void> {
    this.activeJobIds.add(job.id);
    job.status = 'running';
    job.startedAt = this.now();

    try {
      const result = await this.options.execute(job);
      job.result = result;
      if (result.status === 'completed') {
        job.status = 'completed';
      } else {
        job.status = 'failed';
        job.error = result.error ?? 'Job returned a failed result';
      }
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
    } finally {
      job.completedAt = this.now();
      this.activeJobIds.delete(job.id);
      this.pruneHistory();
      this.processQueue();
    }
  }

  private pruneHistory(): void {
    const terminalJobs = this.retainedJobs.filter(
      (job) => job.status === 'completed' || job.status === 'failed',
    );
    const overflow = terminalJobs.length - this.options.maxRetained;
    if (overflow <= 0) return;

    const idsToRemove = new Set(terminalJobs.slice(0, overflow).map((job) => job.id));
    for (let index = this.retainedJobs.length - 1; index >= 0; index--) {
      if (idsToRemove.has(this.retainedJobs[index].id)) this.retainedJobs.splice(index, 1);
    }
  }
}
