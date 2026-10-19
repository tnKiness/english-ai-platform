import { expect, it } from 'vitest';
import { transitionJob, canCommit } from '../../src/domain/jobs/state.js';
import { blindContext } from '../../src/application/context/blind-context.js';
it('rejects commit from stale, expired or cancelled runs', () => {
  expect(canCommit('VALIDATING', 2, 2, 101, 100)).toBe(true);
  expect(canCommit('VALIDATING', 2, 1, 101, 100)).toBe(false);
  expect(canCommit('VALIDATING', 2, 2, 100, 100)).toBe(false);
  expect(canCommit('CANCELLED', 2, 2, 101, 100)).toBe(false);
  expect(() => transitionJob('COMPLETED', 'QUEUED')).toThrow();
  expect(() => transitionJob('QUEUED', 'COMPLETED')).toThrow();
});
it('blind view drops answers and hidden metadata by whitelist', () => {
  const item = { item_id: 'a', prompt: 'Synthetic question', learner_resource_ids: ['media'], answer: 'secret', explanation: 'secret', hidden_target: 'secret', unexpected: 'secret' };
  expect(blindContext(item)).toEqual({ item_id: 'a', prompt: 'Synthetic question', resource_ids: ['media'] });
});
