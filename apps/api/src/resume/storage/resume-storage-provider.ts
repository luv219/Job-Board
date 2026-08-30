export type ResumeMimeType = 'application/pdf';

export interface StoredResume {
  provider: 'cloudinary';
  assetId: string;
  sizeBytes: number;
}

export interface ResumeStorageProvider {
  uploadResume(input: { buffer: Buffer; mimeType: ResumeMimeType }): Promise<StoredResume>;
  createApplicationSnapshot(input: { sourceAssetId: string; mimeType: ResumeMimeType }): Promise<StoredResume>;
  deleteResume(assetId: string): Promise<void>;
  createAccessUrl(input: { assetId: string; expiresAt: Date }): Promise<string>;
}
