import nodemailer from 'nodemailer';
import type { Environment } from '../config/env.js';
import type { EmailMessage, EmailProvider } from './email-provider.js';

export class SmtpEmailProvider implements EmailProvider {
  private readonly transport;
  private readonly from: string;

  public constructor(environment: Environment) {
    if (!environment.EMAIL_FROM || !environment.SMTP_HOST || !environment.SMTP_PORT || !environment.SMTP_USER || !environment.SMTP_PASSWORD) {
      throw new Error('SMTP email configuration is incomplete');
    }
    this.from = environment.EMAIL_FROM;
    this.transport = nodemailer.createTransport({
      host: environment.SMTP_HOST, port: environment.SMTP_PORT, secure: environment.SMTP_SECURE ?? environment.SMTP_PORT === 465,
      auth: { user: environment.SMTP_USER, pass: environment.SMTP_PASSWORD }, connectionTimeout: 10_000, socketTimeout: 10_000,
    });
  }

  public async send(message: EmailMessage): Promise<{ messageId?: string }> {
    const result = await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    return { messageId: result.messageId };
  }
}
