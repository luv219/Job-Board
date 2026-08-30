import { describe, expect, it } from 'vitest';
import { buildAtlasSearchPipeline } from '../src/jobs/atlas-search.js';

describe('Atlas Search pipeline construction', () => {
  it('uses weighted fuzzy text with public eligibility and structured filters', () => {
    const pipeline = buildAtlasSearchPipeline({ q: 'enginerr', country: 'India', workMode: 'REMOTE', page: 1, limit: 20 }, 'jobs_public_v1', new Date('2026-01-01'));
    const search = pipeline[0].$search;
    expect(search.index).toBe('jobs_public_v1');
    expect(search.compound.must[0].text.fuzzy).toMatchObject({ maxEdits: 1, prefixLength: 2, maxExpansions: 50 });
    expect(JSON.stringify(search.compound.filter)).toContain('PUBLISHED');
    expect(JSON.stringify(search.compound.filter)).toContain('REMOTE');
    expect(JSON.stringify(pipeline[1])).toContain('applicationDeadline');
  });
});
