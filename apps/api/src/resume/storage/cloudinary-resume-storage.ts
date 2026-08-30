import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'node:crypto';
import type { Environment } from '../../config/env.js';
import type { ResumeStorageProvider, StoredResume } from './resume-storage-provider.js';

const RESUME_FOLDER = 'job-board/resumes';
const APPLICATION_RESUME_FOLDER = 'job-board/application-resumes';

export class CloudinaryResumeStorageProvider implements ResumeStorageProvider {
  public constructor(environment: Pick<Environment, 'CLOUDINARY_CLOUD_NAME' | 'CLOUDINARY_API_KEY' | 'CLOUDINARY_API_SECRET'>) {
    if (!environment.CLOUDINARY_CLOUD_NAME || !environment.CLOUDINARY_API_KEY || !environment.CLOUDINARY_API_SECRET) {
      throw new Error('Cloudinary resume storage is not configured');
    }
    cloudinary.config({
      cloud_name: environment.CLOUDINARY_CLOUD_NAME,
      api_key: environment.CLOUDINARY_API_KEY,
      api_secret: environment.CLOUDINARY_API_SECRET,
      secure: true,
    });
  }

  public async uploadResume(input: { buffer: Buffer; mimeType: 'application/pdf' }): Promise<StoredResume> {
    const upload = await new Promise<{ public_id: string; bytes: number }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({
        resource_type: 'raw',
        type: 'private',
        folder: RESUME_FOLDER,
        public_id: randomUUID(),
        format: 'pdf',
        overwrite: false,
        use_filename: false,
        unique_filename: false,
      }, (error, result) => {
        if (error || !result) { reject(error ?? new Error('Cloudinary upload did not return an asset')); return; }
        resolve({ public_id: result.public_id, bytes: result.bytes });
      });
      stream.end(input.buffer);
    });
    return { provider: 'cloudinary', assetId: upload.public_id, sizeBytes: upload.bytes };
  }

  public async createApplicationSnapshot(input: { sourceAssetId: string; mimeType: 'application/pdf' }): Promise<StoredResume> {
    const sourceUrl = cloudinary.utils.private_download_url(input.sourceAssetId, 'pdf', {
      resource_type: 'raw', type: 'private', expires_at: Math.floor((Date.now() + 60_000) / 1_000), attachment: true,
    });
    const upload = await cloudinary.uploader.upload(sourceUrl, {
      resource_type: 'raw', type: 'private', folder: APPLICATION_RESUME_FOLDER, public_id: randomUUID(), format: 'pdf',
      overwrite: false, use_filename: false, unique_filename: false,
    });
    return { provider: 'cloudinary', assetId: upload.public_id, sizeBytes: upload.bytes };
  }

  public async deleteResume(assetId: string): Promise<void> {
    await cloudinary.uploader.destroy(assetId, { resource_type: 'raw', type: 'private', invalidate: true });
  }

  public async createAccessUrl(input: { assetId: string; expiresAt: Date }): Promise<string> {
    return cloudinary.utils.private_download_url(input.assetId, 'pdf', {
      resource_type: 'raw',
      type: 'private',
      expires_at: Math.floor(input.expiresAt.getTime() / 1_000),
      attachment: true,
    });
  }
}
