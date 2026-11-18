import type { Db } from './database.js';

/**
 * Compare-and-set acceptance (06A §9.B.3): a proposal only applies to the plan version it was built on.
 * `apply` runs inside the same transaction, only when the proposal is accepted (D-02 F, E-33).
 */
export class ReplanRepository {
  constructor(private db: Db, private now: () => Date) {}
  accept(proposalId: string, apply?: (changesJson: string) => void): string {
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
      if (state === 'ACCEPTED') apply?.(proposal.changes_json);
      this.db.prepare('UPDATE replan_proposals SET state = ?, updated_at = ? WHERE proposal_id = ?').run(state, at, proposalId);
      return state;
    }).immediate();
  }

  /** "Giữ nguyên lịch" (F4): the proposal is closed, the plan is untouched. */
  reject(proposalId: string): string {
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT state FROM replan_proposals WHERE proposal_id = ?').get(proposalId) as { state: string } | undefined;
      if (!row) throw new Error('UNKNOWN_PROPOSAL');
      if (row.state !== 'PROPOSED') return row.state;
      this.db.prepare("UPDATE replan_proposals SET state = 'REJECTED', updated_at = ? WHERE proposal_id = ?").run(this.now().toISOString(), proposalId);
      return 'REJECTED';
    }).immediate();
  }
}
