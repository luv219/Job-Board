export type EmailMessageType = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'APPLICATION_SUBMITTED' | 'NEW_APPLICATION' | 'APPLICATION_STATUS_CHANGED' | 'COMPANY_INVITATION';

export interface EmailMessage {
  type: EmailMessageType;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<{ messageId?: string }>;
}
