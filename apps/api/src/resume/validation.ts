import path from 'node:path';
import { fileTypeFromBuffer } from 'file-type';
import { AppError } from '../lib/app-error.js';
import type { ResumeMimeType } from './storage/resume-storage-provider.js';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const RESUME_FIELD_NAME = 'resume';

export function sanitizedPdfFilename(filename: string): string {
  const safe = path.basename(filename.replaceAll('\\', '/')).split('').filter((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  }).join('').trim().slice(0, 120);
  if (!safe || !safe.toLowerCase().endsWith('.pdf')) {
    throw new AppError({ statusCode: 400, code: 'RESUME_INVALID_FILE', message: 'Resume filename must use the .pdf extension' });
  }
  return safe;
}

export async function validateResumeFile(file: Express.Multer.File): Promise<{ filename: string; mimeType: ResumeMimeType }> {
  if (file.mimetype !== 'application/pdf') {
    throw new AppError({ statusCode: 415, code: 'RESUME_UNSUPPORTED_TYPE', message: 'Only PDF resumes are supported' });
  }
  const filename = sanitizedPdfFilename(file.originalname);
  const detected = await fileTypeFromBuffer(file.buffer);
  if (detected?.mime !== 'application/pdf' || detected.ext !== 'pdf') {
    throw new AppError({ statusCode: 400, code: 'RESUME_INVALID_FILE', message: 'Resume content is not a valid PDF file' });
  }
  return { filename, mimeType: 'application/pdf' };
}
