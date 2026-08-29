import type { Logger } from 'pino';
import { ApplicantProfile, type ApplicantProfileRecord } from '../models/applicant-profile.js';
import { AppError } from '../lib/app-error.js';
import type { ResumeStorageProvider } from './storage/resume-storage-provider.js';

export type ResumeRecord = NonNullable<ApplicantProfileRecord['resume']>;

export class ResumeService {
  public constructor(private readonly storage: ResumeStorageProvider, private readonly logger: Logger) {}

  public async upload(userId: string, file: { buffer: Buffer; filename: string; mimeType: 'application/pdf' }): Promise<ResumeRecord> {
    const profile = await ApplicantProfile.findOne({ userId }).lean();
    if (!profile) throw new AppError({ statusCode: 409, code: 'PROFILE_REQUIRED', message: 'Create an applicant profile before uploading a resume' });

    let stored;
    try { stored = await this.storage.uploadResume({ buffer: file.buffer, mimeType: file.mimeType }); }
    catch (error) { throw this.storageError(error); }

    const resume: ResumeRecord = { provider: stored.provider, assetId: stored.assetId, originalFilename: file.filename, mimeType: file.mimeType, sizeBytes: stored.sizeBytes, uploadedAt: new Date() };
    const filter = profile.resume ? { userId, 'resume.assetId': profile.resume.assetId } : { userId, resume: { $exists: false } };
    let updated;
    try { updated = await ApplicantProfile.findOneAndUpdate(filter, { $set: { resume } }, { returnDocument: 'after', runValidators: true }).lean(); }
    catch (error) { await this.discard(stored.assetId); throw error; }
    if (!updated) {
      await this.discard(stored.assetId);
      throw new AppError({ statusCode: 409, code: 'CONFLICT', message: 'Resume changed while uploading; retry the upload' });
    }

    if (profile.resume) await this.discard(profile.resume.assetId);
    this.logger.info({ event: 'resume_uploaded', sizeBytes: resume.sizeBytes }, 'Applicant resume uploaded');
    return resume;
  }

  public async getMetadata(userId: string): Promise<ResumeRecord> {
    const profile = await ApplicantProfile.findOne({ userId }).lean();
    if (!profile?.resume) throw new AppError({ statusCode: 404, code: 'RESUME_NOT_FOUND', message: 'Resume not found' });
    return profile.resume;
  }

  public async createAccessUrl(userId: string): Promise<{ url: string; expiresAt: Date }> {
    const resume = await this.getMetadata(userId);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1_000);
    try { return { url: await this.storage.createAccessUrl({ assetId: resume.assetId, expiresAt }), expiresAt }; }
    catch (error) { throw this.storageError(error); }
  }

  public async remove(userId: string): Promise<void> {
    const profile = await ApplicantProfile.findOne({ userId }).lean();
    if (!profile?.resume) throw new AppError({ statusCode: 404, code: 'RESUME_NOT_FOUND', message: 'Resume not found' });
    const updated = await ApplicantProfile.findOneAndUpdate({ userId, 'resume.assetId': profile.resume.assetId }, { $unset: { resume: 1 } }, { returnDocument: 'after' }).lean();
    if (!updated) throw new AppError({ statusCode: 409, code: 'CONFLICT', message: 'Resume changed while deleting; retry the request' });
    await this.discard(profile.resume.assetId);
    this.logger.info({ event: 'resume_removed' }, 'Applicant resume removed');
  }

  private async discard(assetId: string): Promise<void> {
    try { await this.storage.deleteResume(assetId); }
    catch { this.logger.warn({ event: 'resume_storage_cleanup_failed' }, 'Resume storage cleanup failed'); }
  }

  private storageError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    this.logger.error({ event: 'resume_storage_failed' }, 'Resume storage operation failed');
    return new AppError({ statusCode: 502, code: 'RESUME_STORAGE_ERROR', message: 'Resume storage is temporarily unavailable' });
  }
}
