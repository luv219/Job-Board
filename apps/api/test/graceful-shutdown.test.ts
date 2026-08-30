import { describe, expect, it, vi } from 'vitest';
import pino from 'pino';
import { createGracefulShutdown } from '../src/lib/graceful-shutdown.js';

describe('graceful shutdown coordinator', () => {
  it('closes HTTP and MongoDB once, then finishes with the requested exit code', async () => {
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const disconnectDatabase = vi.fn(async () => undefined);
    const finish = vi.fn();
    const shutdown = createGracefulShutdown({ server: { close }, disconnectDatabase, logger: pino({ enabled: false }), timeoutMs: 1_000, finish });
    await Promise.all([shutdown('SIGTERM', 0), shutdown('SIGTERM', 0)]);
    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnectDatabase).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith(0);
  });

  it('forces completion after the bounded grace period', async () => {
    vi.useFakeTimers();
    const closeAllConnections = vi.fn();
    const finish = vi.fn();
    const shutdown = createGracefulShutdown({ server: { close: () => undefined, closeAllConnections }, disconnectDatabase: async () => undefined, logger: pino({ enabled: false }), timeoutMs: 100, finish });
    void shutdown('SIGTERM', 0);
    await vi.advanceTimersByTimeAsync(100);
    expect(closeAllConnections).toHaveBeenCalledTimes(1);
    expect(finish).toHaveBeenCalledWith(1);
    vi.useRealTimers();
  });
});
