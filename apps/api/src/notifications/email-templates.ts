import type { EmailMessage, EmailMessageType } from './email-provider.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character);
}

function email(type: EmailMessageType, to: string, subject: string, text: string, body: string): EmailMessage {
  return { type, to, subject, text, html: `<!doctype html><html><body><p>${body}</p></body></html>` };
}

export function buildVerificationEmail(input: { to: string; link: string }): EmailMessage {
  return email('EMAIL_VERIFICATION', input.to, 'Verify your Job Board email', `Verify your email: ${input.link}`, `Verify your email by opening <a href="${escapeHtml(input.link)}">this secure link</a>.`);
}

export function buildPasswordResetEmail(input: { to: string; link: string }): EmailMessage {
  return email('PASSWORD_RESET', input.to, 'Reset your Job Board password', `Reset your password: ${input.link}`, `Reset your password by opening <a href="${escapeHtml(input.link)}">this secure link</a>.`);
}

export function buildApplicationSubmittedEmail(input: { to: string; jobTitle: string; companyName: string; link: string }): EmailMessage {
  const job = escapeHtml(input.jobTitle); const company = escapeHtml(input.companyName);
  return email('APPLICATION_SUBMITTED', input.to, 'Application submitted', `Your application for ${input.jobTitle} at ${input.companyName} was submitted. View it: ${input.link}`, `Your application for <strong>${job}</strong> at ${company} was submitted. <a href="${escapeHtml(input.link)}">View applications</a>.`);
}

export function buildNewApplicationEmail(input: { to: string; jobTitle: string; applicantName: string; link: string }): EmailMessage {
  const job = escapeHtml(input.jobTitle); const applicant = escapeHtml(input.applicantName);
  return email('NEW_APPLICATION', input.to, 'New Job Board application', `${input.applicantName} applied for ${input.jobTitle}. Review it: ${input.link}`, `${applicant} applied for <strong>${job}</strong>. <a href="${escapeHtml(input.link)}">Review applications</a>.`);
}

export function buildApplicationStatusChangedEmail(input: { to: string; jobTitle: string; companyName: string; status: string; link: string }): EmailMessage {
  const job = escapeHtml(input.jobTitle); const company = escapeHtml(input.companyName); const status = escapeHtml(input.status.replaceAll('_', ' ').toLowerCase());
  return email('APPLICATION_STATUS_CHANGED', input.to, 'Application status updated', `Your application for ${input.jobTitle} at ${input.companyName} is now ${input.status}. View it: ${input.link}`, `Your application for <strong>${job}</strong> at ${company} is now <strong>${status}</strong>. <a href="${escapeHtml(input.link)}">View applications</a>.`);
}
export function buildCompanyInvitationEmail(input: { to: string; companyName: string; inviterName: string; link: string; expiresAt: Date }): EmailMessage {
  const company = escapeHtml(input.companyName); const inviter = escapeHtml(input.inviterName);
  return email('COMPANY_INVITATION', input.to, `Invitation to join ${input.companyName}`, `${input.inviterName} invited you to recruit for ${input.companyName}. Accept before ${input.expiresAt.toISOString()}: ${input.link}`, `${inviter} invited you to join <strong>${company}</strong> as a recruiter. <a href="${escapeHtml(input.link)}">Accept invitation</a>.`);
}
