import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { CheckpointManager, type CheckpointData } from '../src/storage/checkpoint.js';

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-checkpoint-'));
  temporaryDirectories.push(directory);
  return directory;
}

function checkpoint(query: string, runDir: string): CheckpointData {
  return {
    processedUrls: ['https://www.etsy.com/listing/1/example'],
    successfulUrls: ['https://www.etsy.com/listing/1/example'],
    failedUrls: [],
    timestamp: '',
    query,
    runDir,
    outputName: 'listings-full',
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('CheckpointManager', () => {
  it('persists the run directory and output name required for resume', () => {
    const directory = createTemporaryDirectory();
    const manager = new CheckpointManager(directory, 'budget-tracker');
    manager.save(checkpoint('budget tracker', 'data/runs/run-123'));

    expect(manager.load()).toMatchObject({
      query: 'budget tracker',
      runDir: 'data/runs/run-123',
      outputName: 'listings-full',
    });
  });

  it('isolates checkpoints belonging to different queries', () => {
    const directory = createTemporaryDirectory();
    const first = new CheckpointManager(directory, 'budget-tracker');
    const second = new CheckpointManager(directory, 'wedding-planner');

    first.save(checkpoint('budget tracker', 'data/runs/budget'));
    second.save(checkpoint('wedding planner', 'data/runs/wedding'));

    expect(first.load()?.query).toBe('budget tracker');
    expect(second.load()?.query).toBe('wedding planner');
  });
});
