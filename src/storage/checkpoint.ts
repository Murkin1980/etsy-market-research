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
}

export class CheckpointManager {
  private checkpointDir: string;
  private checkpointFile: string;

  constructor(checkpointDir?: string) {
    this.checkpointDir = checkpointDir ?? config.paths.checkpoints;
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
    this.checkpointFile = path.join(this.checkpointDir, 'checkpoint.json');
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
      const data: CheckpointData = JSON.parse(content);
      log.info(
        { processed: data.processedUrls.length, failed: data.failedUrls.length },
        'Checkpoint loaded',
      );
      return data;
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
