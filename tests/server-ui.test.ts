import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { listRunFiles, resolveRunFile } from '../src/run-files.js';
import { resolveUiAsset } from '../src/server-ui.js';

const temporaryDirectories: string[] = [];

function createTemporaryProject(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'etsy-ui-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('web panel assets', () => {
  it('resolves only registered UI paths', () => {
    const root = createTemporaryProject();
    fs.mkdirSync(path.join(root, 'public'), { recursive: true });
    fs.writeFileSync(path.join(root, 'public', 'index.html'), '<main>panel</main>');

    expect(resolveUiAsset('/', root)).toMatchObject({ contentType: 'text/html; charset=utf-8' });
    expect(resolveUiAsset('/../../.env', root)).toBeNull();
    expect(resolveUiAsset('/assets/unknown.js', root)).toBeNull();
  });
});

describe('run report downloads', () => {
  it('lists and resolves only allowlisted report files', () => {
    const root = createTemporaryProject();
    const runsDir = path.join(root, 'runs');
    const runId = '2026-07-14T10-30-00_planner';
    const reportDir = path.join(runsDir, runId, 'reports');
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(runsDir, runId, 'run-result.json'), '{}');
    fs.writeFileSync(path.join(reportDir, 'listings-summary.csv'), 'title,price');
    fs.writeFileSync(path.join(reportDir, 'private.txt'), 'not exposed');

    const files = listRunFiles(runsDir, runId);
    expect(files?.map((file) => file.name)).toEqual(['run-result.json', 'listings-summary.csv']);
    expect(resolveRunFile(runsDir, runId, 'listings-summary.csv')?.filePath).toBe(path.join(reportDir, 'listings-summary.csv'));
    expect(resolveRunFile(runsDir, runId, 'private.txt')).toBeNull();
  });

  it('rejects traversal and malformed run identifiers', () => {
    const root = createTemporaryProject();
    expect(resolveRunFile(root, '../secret', 'run-result.json')).toBeNull();
    expect(resolveRunFile(root, '..', 'run-result.json')).toBeNull();
    expect(listRunFiles(root, 'name/child')).toBeNull();
  });
});
