import { describe, expect, it } from 'vitest';
import { normalizeProblem } from '../../server/src/http/problem';
import { StateMergeConflictError } from '../../server/src/state/three-way-state-merge';

describe('HTTP problem normalization', () => {
  it('returns an explicit retryable conflict for concurrent serverless state edits', () => {
    const problem = normalizeProblem(new StateMergeConflictError('appUsers[user-1].roles'));

    expect(problem).toMatchObject({ status: 409, code: 'STATE_MERGE_CONFLICT' });
    expect(problem.message).toMatch(/tải lại.*thử lại/i);
  });

  it('preserves safe Fastify 4xx parser errors instead of converting them to HTTP 500', () => {
    const error = Object.assign(new Error('Body cannot be empty'), {
      statusCode: 400,
      code: 'FST_ERR_CTP_EMPTY_JSON_BODY',
    });

    const problem = normalizeProblem(error);

    expect(problem).toMatchObject({ status: 400, code: 'INVALID_REQUEST_BODY' });
  });
});
