import type { EmailMessage, EmailProvider } from '../../src/notifications/email-provider.js';

export class FakeEmailProvider implements EmailProvider {
  public readonly messages: EmailMessage[] = [];
  public fail = false;

  public async send(message: EmailMessage): Promise<{ messageId: string }> {
    if (this.fail) throw new Error('simulated email provider failure');
    this.messages.push(message);
    return { messageId: `fake-${this.messages.length}` };
  }

  public clear(): void { this.messages.splice(0); }
}
