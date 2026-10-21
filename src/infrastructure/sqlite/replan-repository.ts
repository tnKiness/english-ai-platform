import type { Db } from './database.js';

/** Compare-and-set acceptance only; automatic scheduling policy remains D-02/P5. */
export class ReplanRepository {
  constructor(private db: Db, private now: () => Date) {}
  accept(proposalId: string): string {
    return this.db.transaction(() => {
      const proposal = this.db.prepare('SELECT * FROM replan_proposals WHERE proposal_id = ?').get(proposalId) as
        { state: string; expires_at: string; base_plan_version: number; changes_json: string } | undefined;
      if (!proposal) throw new Error('UNKNOWN_PROPOSAL');
      if (proposal.state !== 'PROPOSED') return proposal.state;
      const at = this.now().toISOString();
      let state = 'EXPIRED';
      if (proposal.expires_at > at) {
        const changed = this.db.prepare("UPDATE plan_versions SET plan_version = plan_version + 1, updated_at = ? WHERE plan_id = 'learner' AND plan_version = ?")
          .run(at, proposal.base_plan_version).changes;
        state = changed ? 'ACCEPTED' : 'STALE';
      }
      this.db.prepare('UPDATE replan_proposals SET state = ?, updated_at = ? WHERE proposal_id = ?').run(state, at, proposalId);
      return state;
    }).immediate();
  }
}
