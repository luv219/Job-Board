import type { Logger } from 'pino';
import type { Environment } from '../config/env.js';
import type { EmailMessage } from './email-provider.js';
import type { EmailProvider } from './email-provider.js';
import { buildApplicationStatusChangedEmail, buildApplicationSubmittedEmail, buildNewApplicationEmail, buildPasswordResetEmail, buildVerificationEmail } from './email-templates.js';

function appLink(origin: string, path: string): string { return `${origin.replace(/\/$/, '')}${path}`; }

export class EmailNotificationService {
  public constructor(private readonly provider: EmailProvider, private readonly environment: Environment, private readonly logger: Logger) {}

  public verificationMessage(email: string, token: string): EmailMessage {
    return buildVerificationEmail({ to: email, link: `${appLink(this.environment.WEB_ORIGIN, '/verify-email')}?token=${encodeURIComponent(token)}` });
  }

  public passwordResetMessage(email: string, token: string): EmailMessage {
    return buildPasswordResetEmail({ to: email, link: `${appLink(this.environment.WEB_ORIGIN, '/reset-password')}?token=${encodeURIComponent(token)}` });
  }

  public async sendSecurity(message: EmailMessage, userId: string): Promise<void> {
    try { await this.provider.send(message); this.logger.info({ event: 'security_email_sent', type: message.type, userId }, 'Security email sent'); }
    catch (error) { this.logger.warn({ event: 'security_email_failed', type: message.type, userId, errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Security email delivery failed'); throw error; }
  }

  public async sendApplicationSubmitted(input: { applicantEmail: string; employerEmail: string; applicantUserId: string; employerUserId: string; applicantName: string; jobTitle: string; companyName: string; jobId: string }): Promise<void> {
    await Promise.all([
      this.sendBestEffort(buildApplicationSubmittedEmail({ to: input.applicantEmail, jobTitle: input.jobTitle, companyName: input.companyName, link: appLink(this.environment.WEB_ORIGIN, '/applicant/applications') }), 'APPLICATION_SUBMITTED', input.applicantUserId),
      this.sendBestEffort(buildNewApplicationEmail({ to: input.employerEmail, jobTitle: input.jobTitle, applicantName: input.applicantName, link: appLink(this.environment.WEB_ORIGIN, `/employer/jobs/${input.jobId}/applications`) }), 'NEW_APPLICATION', input.employerUserId),
    ]);
  }

  public async sendApplicationStatusChanged(input: { applicantEmail: string; applicantUserId: string; jobTitle: string; companyName: string; status: string }): Promise<void> {
    await this.sendBestEffort(buildApplicationStatusChangedEmail({ to: input.applicantEmail, jobTitle: input.jobTitle, companyName: input.companyName, status: input.status, link: appLink(this.environment.WEB_ORIGIN, '/applicant/applications') }), 'APPLICATION_STATUS_CHANGED', input.applicantUserId);
  }

  private async sendBestEffort(message: EmailMessage, type: string, userId: string): Promise<void> {
    try { await this.provider.send(message); this.logger.info({ event: 'business_email_sent', type, userId }, 'Business email sent'); }
    catch (error) { this.logger.warn({ event: 'business_email_failed', type, userId, errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Business email delivery failed'); }
  }
}
