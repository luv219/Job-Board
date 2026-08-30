import type { PublicJobSearchQuery } from './validation.js';
import { publicActiveJobFilter } from './public-eligibility.js';

export function buildAtlasSearchPipeline(query: PublicJobSearchQuery, index: string, now: Date) {
  const filter: Record<string, unknown>[] = [{ equals: { path: 'status', value: 'PUBLISHED' } }];
  if (query.workMode) filter.push({ equals: { path: 'workMode', value: query.workMode } });
  if (query.employmentType) filter.push({ equals: { path: 'employmentType', value: query.employmentType } });
  if (query.city) filter.push({ equals: { path: 'location.city', value: query.city } });
  if (query.state) filter.push({ equals: { path: 'location.state', value: query.state } });
  if (query.country) filter.push({ equals: { path: 'location.country', value: query.country } });
  if (query.skills) filter.push({ text: { path: 'skills', query: query.skills } });
  const must = query.q ? [{ text: { query: query.q, path: [{ value: 'title', score: { boost: { value: 10 } } }, { value: 'skills', score: { boost: { value: 6 } } }, { value: 'requirements', score: { boost: { value: 3 } } }, 'description'], fuzzy: { maxEdits: 1, prefixLength: 2, maxExpansions: 50 } } }] : [];
  const active = publicActiveJobFilter(now);
  return [{ $search: { index, compound: { must, filter } } }, { $match: active }];
}
