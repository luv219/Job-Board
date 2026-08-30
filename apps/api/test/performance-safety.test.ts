import { describe, expect, it } from 'vitest';
import { assertSafePerformanceDatabase, assertSafePerformanceTarget, requireSeedConfirmation } from '../../../scripts/performance/safety.js';

describe('performance tooling safety', () => {
  it('allows a local development database with the explicit _perf suffix', () => {
    expect(() => assertSafePerformanceDatabase({ mongoUri: 'mongodb://127.0.0.1:27018/job_board_perf', nodeEnv: 'development' })).not.toThrow();
  });

  it('refuses production, shared, remote, and ambiguous database targets', () => {
    expect(() => assertSafePerformanceDatabase({ mongoUri: 'mongodb://127.0.0.1:27018/job_board_perf', nodeEnv: 'production' })).toThrow(/development or test/);
    expect(() => assertSafePerformanceDatabase({ mongoUri: 'mongodb://mongo.example.test/job_board_perf', nodeEnv: 'development' })).toThrow(/local MongoDB/);
    expect(() => assertSafePerformanceDatabase({ mongoUri: 'mongodb://127.0.0.1:27018/job_board', nodeEnv: 'development' })).toThrow(/ends in _perf/);
    expect(() => assertSafePerformanceDatabase({ mongoUri: 'mongodb://127.0.0.1:27018/production_perf', nodeEnv: 'development' })).toThrow(/ends in _perf/);
  });

  it('allows local HTTP targets but rejects malformed and production-like targets', () => {
    expect(assertSafePerformanceTarget({ target: 'http://localhost:3000' }).origin).toBe('http://localhost:3000');
    expect(() => assertSafePerformanceTarget({ target: 'not a url' })).toThrow(/absolute URL/);
    expect(() => assertSafePerformanceTarget({ target: 'https://production.example.test' })).toThrow(/production host/);
    expect(() => assertSafePerformanceTarget({ target: 'https://staging.example.test' })).toThrow(/PERF_ALLOW_NONLOCAL_TARGET/);
  });

  it('requires explicit confirmation before it can replace a dataset', () => {
    expect(() => requireSeedConfirmation(undefined)).toThrow(/PERF_SEED_CONFIRM/);
    expect(() => requireSeedConfirmation('synthetic')).not.toThrow();
  });
});
