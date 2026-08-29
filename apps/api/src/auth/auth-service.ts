import type { AuthResponse, PublicUser, UserRole } from '@job-board/contracts';
import type { Types } from 'mongoose';
import { AuthSession } from '../models/auth-session.js';
import { User, type UserRecord } from '../models/user.js';
import type { Environment } from '../config/env.js';
import { AppError } from '../lib/app-error.js';
import { hashPassword, verifyPassword } from './password.js';
import { createAccessToken, createRefreshToken, hashRefreshToken } from './tokens.js';

const maxActiveSessions = 5;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type UserDocument = UserRecord & { _id: Types.ObjectId };

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(), email: user.email, role: user.role,
    accountStatus: user.accountStatus, createdAt: user.createdAt.toISOString(),
  };
}

async function issueSession(user: UserDocument, environment: Environment): Promise<{ response: AuthResponse; refreshToken: string }> {
  const refreshToken = createRefreshToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + environment.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const oldestSessions = await AuthSession.find({ userId: user._id, revokedAt: { $exists: false } })
    .sort({ createdAt: 1 }).skip(maxActiveSessions - 1).select('_id').lean();
  if (oldestSessions.length > 0) {
    await AuthSession.updateMany({ _id: { $in: oldestSessions.map((session) => session._id) } }, { $set: { revokedAt: now } });
  }
  await AuthSession.create({ userId: user._id, tokenHash: hashRefreshToken(refreshToken), expiresAt });
  return {
    refreshToken,
    response: {
      accessToken: await createAccessToken(user._id.toString(), user.role, environment),
      expiresIn: environment.ACCESS_TOKEN_TTL_SECONDS,
      user: toPublicUser(user),
    },
  };
}

export async function register(input: { email: string; password: string; role: UserRole }, environment: Environment): Promise<{ response: AuthResponse; refreshToken: string }> {
  try {
    const user = await User.create({ email: normalizeEmail(input.email), passwordHash: await hashPassword(input.password), role: input.role });
    return issueSession(user, environment);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      throw new AppError({ statusCode: 409, code: 'CONFLICT', message: 'An account with this email already exists' });
    }
    throw error;
  }
}

export async function login(input: { email: string; password: string }, environment: Environment): Promise<{ response: AuthResponse; refreshToken: string }> {
  const user = await User.findOne({ email: normalizeEmail(input.email) }).select('+passwordHash');
  if (!user || user.accountStatus !== 'ACTIVE' || !await verifyPassword(user.passwordHash, input.password)) {
    throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Invalid email or password' });
  }
  user.lastLoginAt = new Date();
  await user.save();
  return issueSession(user, environment);
}

export async function refresh(rawToken: string, environment: Environment): Promise<{ response: AuthResponse; refreshToken: string }> {
  const tokenHash = hashRefreshToken(rawToken);
  const now = new Date();
  const session = await AuthSession.findOne({ tokenHash }).select('+tokenHash +previousTokenHash');
  if (!session) {
    const reused = await AuthSession.findOne({ previousTokenHash: tokenHash, revokedAt: { $exists: false } });
    if (reused) await AuthSession.updateOne({ _id: reused._id }, { $set: { revokedAt: now } });
    throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' });
  }
  if (session.revokedAt || session.expiresAt <= now) {
    throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' });
  }
  const user = await User.findById(session.userId);
  if (!user || user.accountStatus !== 'ACTIVE') {
    await AuthSession.updateOne({ _id: session._id }, { $set: { revokedAt: now } });
    throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' });
  }
  const nextRefreshToken = createRefreshToken();
  const rotated = await AuthSession.findOneAndUpdate(
    { _id: session._id, tokenHash, revokedAt: { $exists: false }, expiresAt: { $gt: now } },
    { $set: { tokenHash: hashRefreshToken(nextRefreshToken), previousTokenHash: tokenHash, lastUsedAt: now } },
    { new: true },
  );
  if (!rotated) {
    await AuthSession.updateOne({ _id: session._id }, { $set: { revokedAt: now } });
    throw new AppError({ statusCode: 401, code: 'UNAUTHENTICATED', message: 'Authentication is required' });
  }
  return {
    refreshToken: nextRefreshToken,
    response: { accessToken: await createAccessToken(user._id.toString(), user.role, environment), expiresIn: environment.ACCESS_TOKEN_TTL_SECONDS, user: toPublicUser(user) },
  };
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await AuthSession.updateOne({ tokenHash: hashRefreshToken(rawToken), revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
}
