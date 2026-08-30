import { createRequire } from 'node:module';
import { assertSafePerformanceTarget } from './safety.js';

interface AutocannonResult {
  title: string;
  requests: { average: number; total: number };
  latency: { average: number; p50: number; p95: number; p99: number; max: number };
  errors: number;
  timeouts: number;
  non2xx: number;
}
interface AutocannonOptions { url: string; connections: number; duration: number; overallRate: number; method?: 'GET' | 'POST'; body?: string; headers?: Record<string, string>; }
type Autocannon = (options: AutocannonOptions, callback: (error: Error | null, result: AutocannonResult) => void) => unknown;
const autocannon = createRequire(import.meta.url)('autocannon') as Autocannon;

type Scenario = { name: string; path: string; connections: number; duration: number; overallRate: number; authenticated?: true; method?: 'GET' | 'POST'; body?: string };
const publicScenarios: Scenario[] = [
  { name: 'public-list-newest', path: '/api/v1/jobs?sort=newest&page=1&limit=20', connections: 5, duration: 10, overallRate: 2 },
  { name: 'public-keyword-relevance', path: '/api/v1/jobs?q=engineer&sort=relevance&page=1&limit=20', connections: 5, duration: 10, overallRate: 2 },
  { name: 'public-filtered-list', path: '/api/v1/jobs?city=Bengaluru&workMode=REMOTE&skills=TypeScript&sort=newest&page=1&limit=20', connections: 5, duration: 10, overallRate: 2 },
  { name: 'public-autocomplete', path: '/api/v1/jobs/autocomplete?q=engineer', connections: 3, duration: 10, overallRate: 1 },
  { name: 'public-job-detail', path: '/api/v1/jobs/performance-job-00000', connections: 5, duration: 10, overallRate: 2 },
];
const authenticatedScenarios: Scenario[] = [
  { name: 'applicant-dashboard', path: '/api/v1/applicant/dashboard', connections: 4, duration: 15, overallRate: 4, authenticated: true },
  { name: 'applicant-applications', path: '/api/v1/applicant/applications?page=1&limit=20', connections: 4, duration: 15, overallRate: 4, authenticated: true },
  { name: 'applicant-saved-jobs', path: '/api/v1/applicant/saved-jobs?page=1&limit=20', connections: 4, duration: 15, overallRate: 4, authenticated: true },
];
function employerScenarios(jobId: string | undefined): Scenario[] {
  if (!jobId) throw new Error('PERF_EMPLOYER_JOB_ID is required for the employer profile.');
  return [{ name: 'employer-application-list', path: `/api/v1/employer/jobs/${jobId}/applications?page=1&limit=20`, connections: 4, duration: 10, overallRate: 4, authenticated: true }];
}
function idempotentWriteScenarios(jobId: string | undefined): Scenario[] {
  if (!jobId) throw new Error('PERF_SAVED_JOB_ID is required for the idempotent-write profile.');
  return [{ name: 'idempotent-save-job', path: `/api/v1/applicant/saved-jobs/${jobId}`, connections: 2, duration: 10, overallRate: 1, authenticated: true, method: 'POST', body: '{}' }];
}

function runScenario(scenario: Scenario, origin: URL, accessToken: string | undefined): Promise<Record<string, unknown>> {
  if (scenario.authenticated && !accessToken) throw new Error('PERF_ACCESS_TOKEN is required for authenticated scenarios and is never printed.');
  return new Promise((resolve, reject) => {
    autocannon({ url: new URL(scenario.path, origin).toString(), connections: scenario.connections, duration: scenario.duration, overallRate: scenario.overallRate, ...(scenario.method ? { method: scenario.method } : {}), ...(scenario.body ? { body: scenario.body } : {}), ...(scenario.authenticated ? { headers: { authorization: `Bearer ${accessToken}`, ...(scenario.body ? { 'content-type': 'application/json' } : {}) } } : {}) }, (error, result) => {
      if (error) { reject(error); return; }
      resolve({ scenario: scenario.name, requestsPerSecond: Number(result.requests.average.toFixed(2)), totalRequests: result.requests.total, latencyMs: { average: Number(result.latency.average.toFixed(2)), p50: result.latency.p50, p95: result.latency.p95, p99: result.latency.p99, max: result.latency.max }, errors: result.errors, timeouts: result.timeouts, non2xx: result.non2xx });
    });
  });
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'smoke';
  if (mode !== 'smoke' && mode !== 'authenticated' && mode !== 'employer' && mode !== 'idempotent-write') throw new Error('Usage: npm run perf:smoke, npm run perf:auth, npm run perf:employer, or npm run perf:write.');
  const origin = assertSafePerformanceTarget({ target: process.env.PERF_TARGET ?? 'http://127.0.0.1:3000', allowNonLocalTarget: process.env.PERF_ALLOW_NONLOCAL_TARGET });
  const availableScenarios = mode === 'smoke' ? publicScenarios : mode === 'authenticated' ? authenticatedScenarios : mode === 'employer' ? employerScenarios(process.env.PERF_EMPLOYER_JOB_ID) : idempotentWriteScenarios(process.env.PERF_SAVED_JOB_ID);
  const requestedScenario = process.env.PERF_SCENARIO;
  const scenarios = requestedScenario ? availableScenarios.filter((scenario) => scenario.name === requestedScenario) : availableScenarios;
  if (requestedScenario && scenarios.length === 0) throw new Error(`PERF_SCENARIO is not available for ${mode} mode.`);
  const results: Record<string, unknown>[] = [];
  for (const scenario of scenarios) results.push(await runScenario(scenario, origin, process.env.PERF_ACCESS_TOKEN));
  console.log(JSON.stringify({ target: origin.origin, mode, results }, null, 2));
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Performance load test failed.');
  process.exitCode = 1;
});
