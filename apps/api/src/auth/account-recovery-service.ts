import type { Logger } from 'pino';
import { AccountToken, type AccountTokenPurpose } from '../models/account-token.js';
import { AuthSession } from '../models/auth-session.js';
import { User } from '../models/user.js';
import { AppError } from '../lib/app-error.js';
import { createOneTimeToken, hashOneTimeToken } from './tokens.js';
import { hashPassword } from './password.js';
import { normalizeEmail } from './auth-service.js';
import { EmailNotificationService } from '../notifications/email-notification-service.js';

const verificationLifetimeMs = 24 * 60 * 60_000;
const resetLifetimeMs = 30 * 60_000;

export class AccountRecoveryService {
  public constructor(private readonly notifications: EmailNotificationService, private readonly logger: Logger) {}

  public async requestVerification(userId: string): Promise<void> {
    const user = await User.findOne({ _id: userId, accountStatus: 'ACTIVE' }).lean();
    if (!user || user.emailVerified) return;
    const issued = await this.issue(userId, 'EMAIL_VERIFICATION', verificationLifetimeMs);
    try { await this.notifications.sendSecurity(this.notifications.verificationMessage(user.email, issued.token), userId); }
    catch { await this.revokeIssued(issued.hash); throw new AppError({ statusCode: 503, code: 'EMAIL_DELIVERY_FAILED', message: 'Unable to send verification email' }); }
  }

  public async confirmVerification(token: string): Promise<void> {
    const consumed = await this.consume(token, 'EMAIL_VERIFICATION');
    if (!consumed) throw this.invalidToken();
    const updated = await User.updateOne({ _id: consumed.userId, accountStatus: 'ACTIVE', emailVerified: false }, { $set: { emailVerified: true } });
    if (updated.matchedCount !== 1) throw this.invalidToken();
  }

  public async requestPasswordReset(email: string): Promise<void> {
    const user = await User.findOne({ email: normalizeEmail(email), accountStatus: 'ACTIVE' }).lean();
    if (!user) return;
    const issued = await this.issue(user._id.toString(), 'PASSWORD_RESET', resetLifetimeMs);
    try { await this.notifications.sendSecurity(this.notifications.passwordResetMessage(user.email, issued.token), user._id.toString()); }
    catch { await this.revokeIssued(issued.hash); this.logger.warn({ event: 'password_reset_email_unavailable', userId: user._id.toString() }, 'Password reset email delivery unavailable'); }
  }

  public async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    const consumed = await this.consume(token, 'PASSWORD_RESET');
    if (!consumed) throw this.invalidToken();
    const updated = await User.updateOne({ _id: consumed.userId, accountStatus: 'ACTIVE' }, { $set: { passwordHash } });
    if (updated.matchedCount !== 1) throw this.invalidToken();
    await AuthSession.deleteMany({ userId: consumed.userId });
  }

  private async issue(userId: string, purpose: AccountTokenPurpose, lifetimeMs: number): Promise<{ token: string; hash: string }> {
    const now = new Date();
    const token = createOneTimeToken(); const hash = hashOneTimeToken(token);
    await AccountToken.updateMany({ userId, purpose, consumedAt: null }, { $set: { consumedAt: now } });
    try {
      await AccountToken.create({ userId, purpose, tokenHash: hash, expiresAt: new Date(now.getTime() + lifetimeMs) });
    } catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 11000) throw error;
      await AccountToken.updateMany({ userId, purpose, consumedAt: null }, { $set: { consumedAt: now } });
      await AccountToken.create({ userId, purpose, tokenHash: hash, expiresAt: new Date(now.getTime() + lifetimeMs) });
    }
    return { token, hash };
  }

  private async consume(token: string, purpose: AccountTokenPurpose) {
    return AccountToken.findOneAndUpdate(
      { tokenHash: hashOneTimeToken(token), purpose, consumedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } }, { returnDocument: 'after' },
    ).select('+tokenHash').lean();
  }

  private async revokeIssued(tokenHash: string): Promise<void> {
    await AccountToken.updateOne({ tokenHash, consumedAt: null }, { $set: { consumedAt: new Date() } });
  }

  private invalidToken(): AppError {
    return new AppError({ statusCode: 400, code: 'TOKEN_INVALID_OR_EXPIRED', message: 'Token is invalid or expired' });
  }
}
