import type { Logger } from 'pino';
import type { Environment } from '../config/env.js';
import { ConsoleEmailProvider } from './console-email-provider.js';
import type { EmailProvider } from './email-provider.js';
import { SmtpEmailProvider } from './smtp-email-provider.js';

export function createEmailProvider(environment: Environment, logger: Logger): EmailProvider {
  if (environment.EMAIL_PROVIDER === 'smtp') return new SmtpEmailProvider(environment);
  return new ConsoleEmailProvider(logger);
}
