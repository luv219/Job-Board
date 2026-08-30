import { Router, type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import type { Environment } from '../config/env.js';
import { AppError } from '../lib/app-error.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { ResumeService, type ResumeRecord } from '../resume/resume-service.js';
import { createResumeStorageProvider } from '../resume/storage/create-resume-storage-provider.js';
import { MAX_RESUME_BYTES, RESUME_FIELD_NAME, validateResumeFile } from '../resume/validation.js';
import { privateNoStore } from '../middleware/security.js';

function metadataResponse(resume: ResumeRecord) {
  return { originalFilename: resume.originalFilename, mimeType: resume.mimeType, sizeBytes: resume.sizeBytes, uploadedAt: resume.uploadedAt.toISOString() };
}

function resumeUpload(request: Request, response: Response, next: NextFunction): void {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_RESUME_BYTES, files: 1, fields: 0, parts: 2, fieldNameSize: 32 },
    fileFilter: (_request, file, callback) => {
      if (file.mimetype !== 'application/pdf') {
        callback(new AppError({ statusCode: 415, code: 'RESUME_UNSUPPORTED_TYPE', message: 'Only PDF resumes are supported' }));
        return;
      }
      callback(null, true);
    },
  }).single(RESUME_FIELD_NAME);
  parser(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      next(new AppError({
        statusCode: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        code: error.code === 'LIMIT_FILE_SIZE' ? 'RESUME_TOO_LARGE' : 'RESUME_INVALID_FILE',
        message: error.code === 'LIMIT_FILE_SIZE' ? 'Resume must be 5 MB or smaller' : 'Invalid resume upload',
      }));
      return;
    }
    next(error);
  });
}

export function createResumeRouter(environment: Environment, storage = createResumeStorageProvider(environment)): Router {
  const router = Router();
  const applicantOnly = [privateNoStore, requireAuth(environment), requireRole('APPLICANT')];
  const uploadLimit = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (request) => request.principal!.id,
    handler: (_request, _response, next) => next(new AppError({ statusCode: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many resume upload attempts; try again later' })),
  });

  router.put('/applicant/resume', ...applicantOnly, uploadLimit, resumeUpload, async (request, response, next) => {
    try {
      if (!request.file) throw new AppError({ statusCode: 400, code: 'RESUME_INVALID_FILE', message: 'Attach one PDF file in the resume field' });
      const file = await validateResumeFile(request.file);
      const resume = await new ResumeService(storage, request.log).upload(request.principal!.id, { buffer: request.file.buffer, filename: file.filename, mimeType: file.mimeType });
      response.json({ resume: metadataResponse(resume) });
    } catch (error) { next(error); }
  });

  router.get('/applicant/resume', ...applicantOnly, async (request, response, next) => {
    try { response.json({ resume: metadataResponse(await new ResumeService(storage, request.log).getMetadata(request.principal!.id)) }); }
    catch (error) { next(error); }
  });

  router.post('/applicant/resume/access', ...applicantOnly, async (request, response, next) => {
    try {
      const access = await new ResumeService(storage, request.log).createAccessUrl(request.principal!.id);
      response.set('Cache-Control', 'private, no-store').json({ accessUrl: access.url, expiresAt: access.expiresAt.toISOString() });
    } catch (error) { next(error); }
  });

  router.delete('/applicant/resume', ...applicantOnly, async (request, response, next) => {
    try { await new ResumeService(storage, request.log).remove(request.principal!.id); response.sendStatus(204); }
    catch (error) { next(error); }
  });

  return router;
}
