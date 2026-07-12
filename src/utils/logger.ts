import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';

const logsDir = config.paths.logs;
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const appLogStream = pino.destination(path.join(logsDir, 'app.log'));
const errorLogStream = pino.destination(path.join(logsDir, 'error.log'));

export const logger = pino(
  {
    level: config.logging.level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
  },
  appLogStream,
);

export const errorLogger = pino(
  {
    level: 'error',
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  errorLogStream,
);

export function createChildLogger(name: string) {
  return logger.child({ module: name });
}
