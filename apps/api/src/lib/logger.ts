import pino from 'pino';
import type { Environment } from '../config/env.js';

export function createLogger(environment: Pick<Environment, 'NODE_ENV' | 'LOG_LEVEL'>, destination?: pino.DestinationStream): pino.Logger {
  const options: pino.LoggerOptions = {
    level: environment.NODE_ENV === 'test' ? 'silent' : environment.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization', 'req.headers.cookie', 'req.headers["set-cookie"]',
        'res.headers["set-cookie"]', 'req.body', 'err.body', 'password', '*.password', 'token', '*.token',
        'tokenHash', '*.tokenHash', 'verificationToken', '*.verificationToken', 'resetToken', '*.resetToken', 'refreshToken', '*.refreshToken', 'accessToken', '*.accessToken',
        'html', '*.html', 'text', '*.text', 'accessUrl', '*.accessUrl',
      ],
      censor: '[REDACTED]',
    },
  };
  return destination ? pino(options, destination) : pino(options);
}
