import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { CompanyMember } from '../src/models/company-member.js';
import { CompanyInvitation } from '../src/models/company-invitation.js';

describe('company team models', () => {
  it('limits membership to the two Phase 19 company roles', async () => {
    await expect(new CompanyMember({ companyId: new Types.ObjectId(), userId: new Types.ObjectId(), role: 'OWNER' }).validate()).resolves.toBeUndefined();
    await expect(new CompanyMember({ companyId: new Types.ObjectId(), userId: new Types.ObjectId(), role: 'ADMIN' }).validate()).rejects.toBeDefined();
  });

  it('persists invitation security state without a raw token field', async () => {
    const invitation = new CompanyInvitation({ companyId: new Types.ObjectId(), invitedEmail: 'recruiter@example.test', role: 'RECRUITER', tokenHash: 'a'.repeat(64), invitedByUserId: new Types.ObjectId(), expiresAt: new Date(Date.now() + 60_000) });
    await expect(invitation.validate()).resolves.toBeUndefined();
    expect(invitation.toObject()).not.toHaveProperty('token');
  });
});
