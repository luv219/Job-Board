import pino from 'pino';
import type { Environment } from '../config/env.js';

export function createLogger(environment: Pick<Environment, 'NODE_ENV' | 'LOG_LEVEL'>): pino.Logger {
  return pino({
    level: environment.NODE_ENV === 'test' ? 'silent' : environment.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization', 'req.headers.cookie', 'req.headers["set-cookie"]',
        'res.headers["set-cookie"]', 'req.body', 'err.body', 'password', '*.password', 'token', '*.token',
      ],
      censor: '[REDACTED]',
    },
  });
}
