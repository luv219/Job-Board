import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Environment } from '../config/env.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { privateNoStore, principalRateLimit } from '../middleware/security.js';
import { validate } from '../validation/validate.js';
import { AppError } from '../lib/app-error.js';
import { requireCompanyOwner, resolveEmployerCompanyAccess } from '../company/access.js';
import { CompanyMember } from '../models/company-member.js';
import { CompanyInvitation } from '../models/company-invitation.js';
import { User } from '../models/user.js';
import { EmployerProfile } from '../models/employer-profile.js';
import type { EmailNotificationService } from '../notifications/email-notification-service.js';
import { isValidObjectId } from '../lib/object-id.js';

const emailSchema = z.object({ email: z.string().trim().email().max(320).transform((email) => email.toLowerCase()) }).strict();
const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const idSchema = z.object({ memberId: z.string().refine(isValidObjectId) }).strict();
const invitationIdSchema = z.object({ invitationId: z.string().refine(isValidObjectId) }).strict();
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const TEAM_LIMIT = 25; const PENDING_INVITATION_LIMIT = 25; const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export function createCompanyTeamRouter(environment: Environment, notifications: EmailNotificationService): Router {
  const router = Router(); const employerOnly = [privateNoStore, requireAuth(environment), requireRole('EMPLOYER')];
  router.post('/employer/company/invitations', ...employerOnly, principalRateLimit(10), validate('body', emailSchema), async (request, response, next) => { try {
    const access = await requireCompanyOwner(request.principal!.id); const email = (request.body as z.infer<typeof emailSchema>).email;
    const target = await User.findOne({ email }).select('role').lean();
    if (target?.role === 'APPLICANT') throw new AppError({ statusCode: 409, code: 'CONFLICT', message: 'This account cannot join an employer company' });
    if (target && (await CompanyMember.exists({ userId: target._id }) || await (await import('../models/company.js')).Company.exists({ ownerUserId: target._id }))) throw new AppError({ statusCode: 409, code: 'EMPLOYER_ALREADY_ASSOCIATED_WITH_COMPANY', message: 'Employer is already associated with a company' });
    if (await CompanyMember.countDocuments({ companyId: access.company._id }) >= TEAM_LIMIT || await CompanyInvitation.countDocuments({ companyId: access.company._id, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }) >= PENDING_INVITATION_LIMIT) throw new AppError({ statusCode: 409, code: 'COMPANY_TEAM_LIMIT_REACHED', message: 'Company invitation limit reached' });
    await CompanyInvitation.updateMany({ companyId: access.company._id, invitedEmail: email, acceptedAt: { $exists: false }, revokedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
    const token = randomBytes(32).toString('base64url'); const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const invitation = await CompanyInvitation.create({ companyId: access.company._id, invitedEmail: email, role: 'RECRUITER', tokenHash: hash(token), invitedByUserId: request.principal!.id, expiresAt });
    const profile = await EmployerProfile.findOne({ userId: request.principal!.id }).select('fullName').lean();
    try { await notifications.sendCompanyInvitation({ email, companyName: access.company.name, inviterName: profile?.fullName ?? 'A company owner', token, expiresAt, invitationId: invitation._id.toString() }); }
    catch { await CompanyInvitation.updateOne({ _id: invitation._id }, { $set: { revokedAt: new Date() } }); throw new AppError({ statusCode: 503, code: 'EMAIL_DELIVERY_FAILED', message: 'Invitation email could not be delivered' }); }
    response.status(201).json({ invitation: { id: invitation._id.toString(), email, role: 'RECRUITER', expiresAt: expiresAt.toISOString() } });
  } catch (error) { next(error); } });
  router.get('/employer/company/invitations', ...employerOnly, async (request, response, next) => { try { const access = await requireCompanyOwner(request.principal!.id); const invitations = await CompanyInvitation.find({ companyId: access.company._id }).sort({ createdAt: -1 }).limit(PENDING_INVITATION_LIMIT).lean(); response.json({ invitations: invitations.map((item) => ({ id: item._id.toString(), email: item.invitedEmail, role: item.role, expiresAt: item.expiresAt.toISOString(), ...(item.acceptedAt ? { acceptedAt: item.acceptedAt.toISOString() } : {}), ...(item.revokedAt ? { revokedAt: item.revokedAt.toISOString() } : {}) })) }); } catch (error) { next(error); } });
  router.delete('/employer/company/invitations/:invitationId', ...employerOnly, validate('params', invitationIdSchema), async (request, response, next) => { try { const access = await requireCompanyOwner(request.principal!.id); await CompanyInvitation.updateOne({ _id: request.params.invitationId, companyId: access.company._id, acceptedAt: { $exists: false } }, { $set: { revokedAt: new Date() } }); response.sendStatus(204); } catch (error) { next(error); } });
  router.post('/employer/company/invitations/accept', ...employerOnly, principalRateLimit(10), validate('body', tokenSchema), async (request, response, next) => { try {
    const token = (request.body as z.infer<typeof tokenSchema>).token; const user = await User.findById(request.principal!.id).select('email role').lean();
    if (!user || user.role !== 'EMPLOYER') throw new AppError({ statusCode: 403, code: 'FORBIDDEN', message: 'Employer access is required' });
    if (await CompanyMember.exists({ userId: user._id }) || await (await import('../models/company.js')).Company.exists({ ownerUserId: user._id })) throw new AppError({ statusCode: 409, code: 'EMPLOYER_ALREADY_ASSOCIATED_WITH_COMPANY', message: 'Employer is already associated with a company' });
    const invitation = await CompanyInvitation.findOneAndUpdate({ tokenHash: hash(token), invitedEmail: user.email, acceptedAt: { $exists: false }, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { acceptedAt: new Date() } }, { returnDocument: 'after' }).lean();
    if (!invitation) throw new AppError({ statusCode: 400, code: 'COMPANY_INVITATION_INVALID', message: 'Invitation is invalid or expired' });
    try { await CompanyMember.create({ companyId: invitation.companyId, userId: user._id, role: 'RECRUITER' }); } catch { throw new AppError({ statusCode: 409, code: 'CONFLICT', message: 'Invitation has already been accepted' }); }
    response.json({ companyId: invitation.companyId.toString(), role: 'RECRUITER' });
  } catch (error) { next(error); } });
  router.get('/employer/company/team', ...employerOnly, async (request, response, next) => { try { const access = await resolveEmployerCompanyAccess(request.principal!.id); const members = await CompanyMember.find({ companyId: access.company._id }).lean(); const profiles = await EmployerProfile.find({ userId: { $in: members.map((member) => member.userId) } }).select('userId fullName').lean(); const names = new Map(profiles.map((profile) => [profile.userId.toString(), profile.fullName])); const owner = { id: `owner-${access.company.ownerUserId.toString()}`, role: 'OWNER' as const, joinedAt: access.company.createdAt.toISOString(), user: { fullName: names.get(access.company.ownerUserId.toString()) ?? 'Company owner' } }; response.json({ members: [owner, ...members.filter((member) => member.userId.toString() !== access.company.ownerUserId.toString()).map((member) => ({ id: member._id.toString(), role: member.role, joinedAt: member.joinedAt.toISOString(), user: { fullName: names.get(member.userId.toString()) ?? 'Employer' } }))] }); } catch (error) { next(error); } });
  router.delete('/employer/company/team/:memberId', ...employerOnly, validate('params', idSchema), async (request, response, next) => { try { const access = await requireCompanyOwner(request.principal!.id); const member = await CompanyMember.findOne({ _id: request.params.memberId, companyId: access.company._id, role: 'RECRUITER' }).lean(); if (!member) throw new AppError({ statusCode: 404, code: 'COMPANY_NOT_FOUND', message: 'Recruiter member not found' }); await CompanyMember.deleteOne({ _id: member._id, role: 'RECRUITER' }); response.sendStatus(204); } catch (error) { next(error); } });
  return router;
}
