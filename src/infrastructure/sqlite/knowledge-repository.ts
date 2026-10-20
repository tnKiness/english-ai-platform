import { randomUUID } from 'node:crypto';
import type { Revocation } from '../../domain/evidence/types.js';
import { transitionRelease, type ReleaseState } from '../../domain/knowledge/release-state.js';
import { isRevoked } from '../../domain/knowledge/revocation.js';
import type { JsonRef } from '../files/json-store.js';
import type { Db } from './database.js';

export interface ItemRegistration { ref: JsonRef; item_family_id: string; shared_stimulus_id: string | null; media_ids: string[] }

/** Package/item index, lifecycle and revocation. Content itself stays in the immutable JSON store. */
export class KnowledgeRepository {
  constructor(private db: Db, private now: () => Date = () => new Date()) {}

  registerPackage(pkg: JsonRef, usageRights: 'verified' | 'unknown', qcPolicyVersion: string, dependencies: JsonRef[], items: ItemRegistration[]): void {
    if (pkg.kind !== 'package') throw new Error('Package ref must be a package JSON object');
    const at = this.now().toISOString();
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO package_versions (package_id, version, content_hash, usage_rights, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(pkg.id, pkg.version, pkg.hash, usageRights, at);
      const dep = this.db.prepare('INSERT INTO package_dependencies (package_id, package_version, dep_kind, dep_id, dep_version, dep_hash) VALUES (?, ?, ?, ?, ?, ?)');
      for (const d of dependencies) dep.run(pkg.id, pkg.version, d.kind, d.id, d.version, d.hash);
      const item = this.db.prepare('INSERT INTO item_versions (item_id, version, package_id, package_version, item_family_id, shared_stimulus_id, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      const media = this.db.prepare('INSERT INTO item_media (item_id, item_version, media_id) VALUES (?, ?, ?)');
      for (const i of items) {
        if (i.ref.kind !== 'item') throw new Error('Item ref must be an item JSON object');
        item.run(i.ref.id, i.ref.version, pkg.id, pkg.version, i.item_family_id, i.shared_stimulus_id, i.ref.hash, at);
        for (const m of i.media_ids) media.run(i.ref.id, i.ref.version, m);
      }
      this.db.prepare('INSERT INTO package_releases (package_id, version, state, qc_policy_version, released_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?)')
        .run(pkg.id, pkg.version, 'draft', qcPolicyVersion, at);
      this.db.prepare('INSERT INTO release_events (event_id, package_id, version, from_state, to_state, reason, created_at) VALUES (?, ?, ?, NULL, ?, ?, ?)')
        .run(randomUUID(), pkg.id, pkg.version, 'draft', 'registered', at);
    })();
  }

  releaseState(packageId: string, version: string): ReleaseState | undefined {
    return (this.db.prepare('SELECT state FROM package_releases WHERE package_id = ? AND version = ?').get(packageId, version) as { state: ReleaseState } | undefined)?.state;
  }

  /**
   * Lifecycle change with guard. Activation requires the caller to name the exact content hash it approved;
   * semantic QC1–4 belongs to P2 and must run before calling this with 'active'.
   */
  transition(packageId: string, version: string, to: ReleaseState, reason: string, approvedHash?: string): void {
    const at = this.now().toISOString();
    this.db.transaction(() => {
      const row = this.db.prepare('SELECT r.state, p.content_hash FROM package_releases r JOIN package_versions p USING (package_id, version) WHERE r.package_id = ? AND r.version = ?')
        .get(packageId, version) as { state: ReleaseState; content_hash: string } | undefined;
      if (!row) throw new Error(`Unknown package ${packageId}@${version}`);
      transitionRelease(row.state, to);
      if (to === 'active') {
        if (approvedHash !== row.content_hash) throw new Error('Activation hash does not match the stored package content');
        if (isRevoked('package', packageId, version, this.revocations())) throw new Error('Revoked package cannot be activated');
      }
      this.db.prepare('UPDATE package_releases SET state = ?, released_at = CASE WHEN ? = \'active\' THEN ? ELSE released_at END, updated_at = ? WHERE package_id = ? AND version = ?')
        .run(to, to, at, at, packageId, version);
      this.db.prepare('INSERT INTO release_events (event_id, package_id, version, from_state, to_state, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), packageId, version, row.state, to, reason, at);
    }).immediate();
  }

  /** Append-only revocation. A revoked package is also suspended so lookups stop serving it immediately. */
  revoke(target: Revocation, reason: string): string {
    const id = randomUUID();
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO revocations (revocation_id, target_kind, target_id, target_version, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, target.target_kind, target.target_id, target.target_version, reason, this.now().toISOString());
      if (target.target_kind === 'package') {
        const rows = this.db.prepare("SELECT version FROM package_releases WHERE package_id = ? AND state = 'active' AND (? IS NULL OR version = ?)")
          .all(target.target_id, target.target_version, target.target_version) as { version: string }[];
        for (const r of rows) this.transition(target.target_id, r.version, 'suspended', `revoked: ${reason}`);
      }
    }).immediate();
    return id;
  }

  revocations(): Revocation[] {
    return this.db.prepare('SELECT target_kind, target_id, target_version FROM revocations').all() as Revocation[];
  }

  /**
   * Servable lookup for assignment: reads lifecycle and revocations in the same read as the item row, so a
   * revocation committed before this call is always seen — no cache sits in front of it.
   */
  servableItem(itemId: string, version: string, scope: 'learner' | 'dry_run'): { ok: true; package_id: string; package_version: string; item_family_id: string; shared_stimulus_id: string | null; hash: string } | { ok: false; reason: string } {
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT i.package_id, i.package_version, i.item_family_id, i.shared_stimulus_id, i.content_hash AS hash, r.state FROM item_versions i JOIN package_releases r ON r.package_id = i.package_id AND r.version = i.package_version WHERE i.item_id = ? AND i.version = ?')
        .get(itemId, version) as { package_id: string; package_version: string; item_family_id: string; shared_stimulus_id: string | null; hash: string; state: ReleaseState } | undefined;
      if (!row) return { ok: false as const, reason: 'UNKNOWN_ITEM' };
      const revs = this.revocations();
      if (isRevoked('item', itemId, version, revs) || isRevoked('package', row.package_id, row.package_version, revs)) return { ok: false as const, reason: 'REVOKED' };
      // Dry-run may exercise drafts; learners only get active releases.
      if (row.state !== 'active' && !(scope === 'dry_run' && row.state === 'draft')) return { ok: false as const, reason: `RELEASE_${row.state.toUpperCase()}` };
      return { ok: true as const, package_id: row.package_id, package_version: row.package_version, item_family_id: row.item_family_id, shared_stimulus_id: row.shared_stimulus_id, hash: row.hash };
    })();
  }
}
