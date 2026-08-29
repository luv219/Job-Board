import type { ResumeStorageProvider, StoredResume } from '../../src/resume/storage/resume-storage-provider.js';

export class FakeResumeStorageProvider implements ResumeStorageProvider {
  public readonly uploaded: string[] = [];
  public readonly deleted: string[] = [];
  public failUpload = false;
  public failAccess = false;
  public failDelete = false;

  public async uploadResume(input: { buffer: Buffer; mimeType: 'application/pdf' }): Promise<StoredResume> {
    if (this.failUpload) throw new Error('simulated storage failure');
    const assetId = `private/resume-${this.uploaded.length + 1}`;
    this.uploaded.push(assetId);
    return { provider: 'cloudinary', assetId, sizeBytes: input.buffer.length };
  }

  public async deleteResume(assetId: string): Promise<void> {
    if (this.failDelete) throw new Error('simulated delete failure');
    this.deleted.push(assetId);
  }

  public async createAccessUrl(input: { assetId: string; expiresAt: Date }): Promise<string> {
    if (this.failAccess) throw new Error('simulated access failure');
    return `https://storage.invalid/private/${input.assetId}?expires=${input.expiresAt.getTime()}`;
  }
}
