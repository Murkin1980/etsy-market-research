import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('checkpoint');

export interface CheckpointData {
  processedUrls: string[];
  successfulUrls: string[];
  failedUrls: string[];
  timestamp: string;
  query: string;
  runDir: string;
  outputName: string;
}

export class CheckpointManager {
  private checkpointDir: string;
  private checkpointFile: string;

  constructor(checkpointDir?: string, checkpointId: string = 'checkpoint') {
    this.checkpointDir = checkpointDir ?? config.paths.checkpoints;
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
    const safeId = checkpointId.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'checkpoint';
    this.checkpointFile = path.join(this.checkpointDir, `${safeId}.json`);
  }

  save(data: CheckpointData): void {
    try {
      data.timestamp = new Date().toISOString();
      fs.writeFileSync(this.checkpointFile, JSON.stringify(data, null, 2), 'utf-8');
      log.debug(
        { processed: data.processedUrls.length, failed: data.failedUrls.length },
        'Checkpoint saved',
      );
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to save checkpoint');
    }
  }

  load(): CheckpointData | null {
    if (!fs.existsSync(this.checkpointFile)) return null;

    try {
      const content = fs.readFileSync(this.checkpointFile, 'utf-8');
      const data = JSON.parse(content) as Partial<CheckpointData>;
      if (
        !Array.isArray(data.processedUrls) ||
        !Array.isArray(data.successfulUrls) ||
        !Array.isArray(data.failedUrls) ||
        typeof data.query !== 'string'
      ) {
        throw new Error('Invalid checkpoint structure');
      }
      log.info(
        { processed: data.processedUrls.length, failed: data.failedUrls.length },
        'Checkpoint loaded',
      );
      return {
        processedUrls: data.processedUrls,
        successfulUrls: data.successfulUrls,
        failedUrls: data.failedUrls,
        timestamp: data.timestamp ?? '',
        query: data.query,
        runDir: data.runDir ?? '',
        outputName: data.outputName ?? 'listings-full',
      };
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to load checkpoint');
      return null;
    }
  }

  exists(): boolean {
    return fs.existsSync(this.checkpointFile);
  }

  clear(): void {
    try {
      if (fs.existsSync(this.checkpointFile)) {
        fs.unlinkSync(this.checkpointFile);
        log.debug('Checkpoint cleared');
      }
    } catch (err) {
      log.warn({ error: (err as Error).message }, 'Failed to clear checkpoint');
    }
  }

  isUrlProcessed(url: string, checkpoint: CheckpointData | null): boolean {
    if (!checkpoint) return false;
    return checkpoint.processedUrls.includes(url) || checkpoint.failedUrls.includes(url);
  }
}
