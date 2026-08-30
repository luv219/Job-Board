import { collectDefaultMetrics, Counter, Histogram, Registry } from '@prometheus-io/client';

export type MetricResult = 'success' | 'failure';
export type SearchMode = 'basic' | 'atlas';
type EmailMetricType = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET' | 'APPLICATION_SUBMITTED' | 'NEW_APPLICATION' | 'APPLICATION_STATUS_CHANGED' | 'COMPANY_INVITATION';
const supportedHttpMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);

export interface OperationalMetrics {
  readonly registry: Registry;
  recordHttpRequest(input: { method: string; route: string; statusCode: number; durationMs: number }): void;
  recordEmail(messageType: EmailMetricType, result: MetricResult): void;
  recordResume(operation: 'upload' | 'access' | 'delete' | 'snapshot', result: MetricResult): void;
  recordSearch(mode: SearchMode, operation: 'search' | 'autocomplete', hasQuery: boolean, result: MetricResult): void;
  recordApplicationSubmission(result: MetricResult): void;
  recordApplicationTransition(result: MetricResult): void;
}

interface MetricsOptions {
  collectProcessMetrics: boolean;
  applicationVersion: string;
  environment: string;
  revision: string;
  searchMode: SearchMode;
}

const latencyBucketsSeconds = [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

export function createOperationalMetrics(options: MetricsOptions): OperationalMetrics {
  const registry = new Registry();
  if (options.collectProcessMetrics) collectDefaultMetrics({ register: registry, prefix: 'job_board_' });

  new Counter({
    name: 'job_board_build_info',
    help: 'Static application build metadata.',
    labelNames: ['version', 'revision', 'environment', 'search_mode'] as const,
    registers: [registry],
  }).inc({ version: options.applicationVersion, revision: options.revision, environment: options.environment, search_mode: options.searchMode });

  const httpRequests = new Counter({
    name: 'job_board_http_requests_total',
    help: 'Completed HTTP requests.',
    labelNames: ['method', 'route', 'status_class'] as const,
    registers: [registry],
  });
  const httpDuration = new Histogram({
    name: 'job_board_http_request_duration_seconds',
    help: 'Completed HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status_class'] as const,
    buckets: latencyBucketsSeconds,
    registers: [registry],
  });
  const emailOperations = new Counter({
    name: 'job_board_email_operations_total',
    help: 'Email delivery attempts by bounded message type and result.',
    labelNames: ['message_type', 'result'] as const,
    registers: [registry],
  });
  const resumeOperations = new Counter({
    name: 'job_board_resume_operations_total',
    help: 'Resume storage operations by operation and result.',
    labelNames: ['operation', 'result'] as const,
    registers: [registry],
  });
  const searchRequests = new Counter({
    name: 'job_board_search_requests_total',
    help: 'Public job search requests by configured mode, query presence, and result.',
    labelNames: ['mode', 'operation', 'has_query', 'result'] as const,
    registers: [registry],
  });
  const applicationSubmissions = new Counter({
    name: 'job_board_application_submissions_total',
    help: 'Application submissions by result.',
    labelNames: ['result'] as const,
    registers: [registry],
  });
  const applicationTransitions = new Counter({
    name: 'job_board_application_status_transitions_total',
    help: 'Employer application status transitions by result.',
    labelNames: ['result'] as const,
    registers: [registry],
  });

  return {
    registry,
    recordHttpRequest: ({ method, route, statusCode, durationMs }) => {
      const labels = { method: supportedHttpMethods.has(method) ? method : 'OTHER', route, status_class: `${Math.floor(statusCode / 100)}xx` };
      httpRequests.inc(labels);
      httpDuration.observe(labels, durationMs / 1_000);
    },
    recordEmail: (messageType, result) => emailOperations.inc({ message_type: messageType, result }),
    recordResume: (operation, result) => resumeOperations.inc({ operation, result }),
    recordSearch: (mode, operation, hasQuery, result) => searchRequests.inc({ mode, operation, has_query: String(hasQuery), result }),
    recordApplicationSubmission: (result) => applicationSubmissions.inc({ result }),
    recordApplicationTransition: (result) => applicationTransitions.inc({ result }),
  };
}
