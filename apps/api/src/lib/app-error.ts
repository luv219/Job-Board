import type { ApiErrorResponse } from '@job-board/contracts';

type ErrorCode = ApiErrorResponse['error']['code'];
type ErrorDetails = NonNullable<ApiErrorResponse['error']['details']>;

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: ErrorDetails;

  public constructor(options: {
    statusCode: number;
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    if (options.details) this.details = options.details;
  }
}
