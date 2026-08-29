import type { Logger } from 'pino';

declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
      principal?: { id: string; role: import('@job-board/contracts').UserRole };
    }
  }
}

export {};
