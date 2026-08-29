import type { Environment } from '../../config/env.js';
import { AppError } from '../../lib/app-error.js';
import { CloudinaryResumeStorageProvider } from './cloudinary-resume-storage.js';
import type { ResumeStorageProvider } from './resume-storage-provider.js';

class UnavailableResumeStorageProvider implements ResumeStorageProvider {
  private unavailable(): never {
    throw new AppError({ statusCode: 503, code: 'RESUME_STORAGE_ERROR', message: 'Resume storage is not configured' });
  }

  public async uploadResume(): Promise<never> { return this.unavailable(); }
  public async deleteResume(): Promise<never> { return this.unavailable(); }
  public async createAccessUrl(): Promise<never> { return this.unavailable(); }
}

export function createResumeStorageProvider(environment: Environment): ResumeStorageProvider {
  if (environment.CLOUDINARY_CLOUD_NAME && environment.CLOUDINARY_API_KEY && environment.CLOUDINARY_API_SECRET) {
    return new CloudinaryResumeStorageProvider(environment);
  }
  return new UnavailableResumeStorageProvider();
}
