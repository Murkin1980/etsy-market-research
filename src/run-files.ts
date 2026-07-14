import fs from 'fs';
import path from 'path';

export interface RunFileDescriptor {
  name: string;
  label: string;
  sizeBytes: number;
  contentType: string;
  downloadPath: string;
}

export interface RunFileDefinition {
  relativePath: string;
  label: string;
  contentType: string;
}

const RUN_FILES: Readonly<Record<string, RunFileDefinition>> = {
  'run-result.json': {
    relativePath: 'run-result.json',
    label: 'Итог запуска',
    contentType: 'application/json; charset=utf-8',
  },
  'listings-full.json': {
    relativePath: 'reports/listings-full.json',
    label: 'Полные данные JSON',
    contentType: 'application/json; charset=utf-8',
  },
  'listings-summary.csv': {
    relativePath: 'reports/listings-summary.csv',
    label: 'Сводная таблица CSV',
    contentType: 'text/csv; charset=utf-8',
  },
  'market-analysis.json': {
    relativePath: 'reports/market-analysis.json',
    label: 'AI-анализ рынка',
    contentType: 'application/json; charset=utf-8',
  },
  'failed-listings.json': {
    relativePath: 'reports/failed-listings.json',
    label: 'Ошибки сбора',
    contentType: 'application/json; charset=utf-8',
  },
  'run-metadata.json': {
    relativePath: 'reports/run-metadata.json',
    label: 'Метаданные запуска',
    contentType: 'application/json; charset=utf-8',
  },
};

export function isSafeRunId(runId: string): boolean {
  return runId.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(runId) && !runId.includes('..');
}

export function resolveRunFile(
  runsDir: string,
  runId: string,
  fileName: string,
): { filePath: string; definition: RunFileDefinition } | null {
  if (!isSafeRunId(runId)) return null;
  const definition = RUN_FILES[fileName];
  if (!definition) return null;

  const runRoot = path.resolve(runsDir, runId);
  const filePath = path.resolve(runRoot, definition.relativePath);
  if (!filePath.startsWith(`${runRoot}${path.sep}`) && filePath !== runRoot) return null;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;

  return { filePath, definition };
}

export function listRunFiles(runsDir: string, runId: string): RunFileDescriptor[] | null {
  if (!isSafeRunId(runId)) return null;
  const runRoot = path.resolve(runsDir, runId);
  if (!fs.existsSync(runRoot) || !fs.statSync(runRoot).isDirectory()) return null;

  return Object.entries(RUN_FILES).flatMap(([name, definition]) => {
    const resolved = resolveRunFile(runsDir, runId, name);
    if (!resolved) return [];
    return [{
      name,
      label: definition.label,
      sizeBytes: fs.statSync(resolved.filePath).size,
      contentType: definition.contentType,
      downloadPath: `/runs/${encodeURIComponent(runId)}/files/${encodeURIComponent(name)}`,
    }];
  });
}
