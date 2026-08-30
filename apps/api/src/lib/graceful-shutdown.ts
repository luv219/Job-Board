import type { Logger } from 'pino';

interface ClosableServer {
  close(callback: (error?: Error) => void): unknown;
  closeAllConnections?(): void;
}

interface ShutdownOptions {
  server: ClosableServer;
  disconnectDatabase: () => Promise<void>;
  logger: Logger;
  timeoutMs: number;
  finish: (exitCode: number) => void;
}

export function createGracefulShutdown({ server, disconnectDatabase, logger, timeoutMs, finish }: ShutdownOptions) {
  let started = false;
  let finished = false;
  const complete = (exitCode: number, event: string): void => {
    if (finished) return;
    finished = true;
    logger.info({ event, exitCode }, 'Graceful shutdown completed');
    finish(exitCode);
  };

  return async (reason: string, exitCode: number): Promise<void> => {
    if (started) return;
    started = true;
    logger.info({ event: 'graceful_shutdown_started', reason }, 'Graceful shutdown started');
    const timeout = setTimeout(() => {
      logger.error({ event: 'graceful_shutdown_timed_out', reason, timeoutMs }, 'Graceful shutdown timed out');
      server.closeAllConnections?.();
      complete(1, 'graceful_shutdown_forced');
    }, timeoutMs);
    timeout.unref();

    try {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await disconnectDatabase();
      clearTimeout(timeout);
      complete(exitCode, 'graceful_shutdown_completed');
    } catch (error) {
      clearTimeout(timeout);
      logger.error({ event: 'graceful_shutdown_failed', errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Graceful shutdown failed');
      complete(1, 'graceful_shutdown_failed');
    }
  };
}
