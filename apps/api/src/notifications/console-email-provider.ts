import type { Logger } from 'pino';
import type { EmailMessage, EmailProvider } from './email-provider.js';

export class ConsoleEmailProvider implements EmailProvider {
  public constructor(private readonly logger: Logger) {}

  public async send(message: EmailMessage): Promise<{ messageId: string }> {
    this.logger.info({ event: 'development_email_generated', type: message.type }, 'Development email generated');
    return { messageId: 'console' };
  }
}
