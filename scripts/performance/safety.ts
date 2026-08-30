const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
const nonProductionOverride = 'I_UNDERSTAND_THIS_IS_NON_PRODUCTION';

function parseUrl(value: string, label: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute URL.`);
  }
}

function databaseName(uri: URL): string {
  return decodeURIComponent(uri.pathname).replace(/^\/+|\/+$/g, '');
}

export function assertSafePerformanceDatabase(input: { mongoUri: string; nodeEnv: string | undefined }): void {
  if (input.nodeEnv !== 'development' && input.nodeEnv !== 'test') {
    throw new Error('Performance seeding is allowed only when NODE_ENV is development or test.');
  }

  const uri = parseUrl(input.mongoUri, 'MONGODB_URI');
  if (uri.protocol !== 'mongodb:' && uri.protocol !== 'mongodb+srv:') {
    throw new Error('MONGODB_URI must use a MongoDB protocol.');
  }
  if (!localHosts.has(uri.hostname.toLowerCase())) {
    throw new Error('Performance seeding accepts only a local MongoDB host.');
  }

  const name = databaseName(uri);
  if (!/^[a-z0-9][a-z0-9_-]*_perf$/i.test(name) || /(?:prod|production|shared)/i.test(name)) {
    throw new Error('Performance seeding requires an explicitly local database whose name ends in _perf.');
  }
}

export function assertSafePerformanceTarget(input: { target: string; allowNonLocalTarget?: string | undefined }): URL {
  const target = parseUrl(input.target, 'PERF_TARGET');
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error('PERF_TARGET must use HTTP or HTTPS.');
  }
  if (target.username || target.password || target.search || target.hash) {
    throw new Error('PERF_TARGET must not contain credentials, query parameters, or a fragment.');
  }

  const hostname = target.hostname.toLowerCase();
  if (/(?:^|[.-])(?:prod|production)(?:[.-]|$)/i.test(hostname)) {
    throw new Error('PERF_TARGET appears to be a production host and is refused.');
  }
  if (!localHosts.has(hostname) && input.allowNonLocalTarget !== nonProductionOverride) {
    throw new Error(`PERF_TARGET must be local unless PERF_ALLOW_NONLOCAL_TARGET is set to ${nonProductionOverride}.`);
  }
  return target;
}

export function requireSeedConfirmation(value: string | undefined): void {
  if (value !== 'synthetic') {
    throw new Error('Set PERF_SEED_CONFIRM=synthetic to permit replacing the local *_perf dataset.');
  }
}
