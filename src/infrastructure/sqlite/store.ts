import type { UnitOfWork } from '../../application/ports.js';
import { BuilderPipeline } from '../../application/qc/pipeline.js';
import { loadPlaybook, loadQcSpec, type QcSpec } from '../contracts/knowledge-specs.js';
import { validateKnowledge } from '../contracts/validate.js';
import { JsonStore } from '../files/json-store.js';
import { MediaStore } from '../files/media-store.js';
import { canonicalJson, ensureDataDirs, sha256, type DataPaths } from '../files/paths.js';
import { AiAccountsRepository } from './ai-accounts-repository.js';
import { BuilderRepository } from './builder-repository.js';
import { openDatabase, type Db, type OpenOptions } from './database.js';
import { SqliteJobQueue } from './job-queue.js';
import { KnowledgeRepository } from './knowledge-repository.js';
import { LearningRepository } from './learning-repository.js';
import { ResultCache } from './result-cache.js';

export interface Store {
  db: Db; paths: DataPaths; uow: UnitOfWork; now: () => Date;
  json: JsonStore; media: MediaStore; knowledge: KnowledgeRepository; learning: LearningRepository; queue: SqliteJobQueue;
  builder: BuilderRepository; cache: ResultCache; aiAccounts: AiAccountsRepository;
  close(): void;
}

/** Composition root for persistence: one SQLite connection shared by all repositories. */
export async function openStore(paths: DataPaths, options: OpenOptions & { now?: () => Date } = {}): Promise<Store> {
  ensureDataDirs(paths);
  const now = options.now ?? (() => new Date());
  const db = await openDatabase(paths.db, options);
  const knowledge = new KnowledgeRepository(db, now);
  return {
    db, paths, now,
    uow: { run: <T>(fn: () => T): T => db.transaction(fn).immediate() },
    json: new JsonStore(db, paths.knowledge, paths.staging, now),
    media: new MediaStore(db, paths.media, paths.staging, now),
    knowledge,
    learning: new LearningRepository(db, knowledge, now),
    queue: new SqliteJobQueue(db, knowledge, now),
    builder: new BuilderRepository(db, now),
    cache: new ResultCache(db, now),
    aiAccounts: new AiAccountsRepository(db, now),
    close: () => db.close(),
  };
}

/** Builder pipeline wired to the store with the versioned QC Spec and Playbook (overridable for tests). */
export function builderPipeline(store: Store, options: { spec?: QcSpec; contextPolicyVersion?: string } = {}): BuilderPipeline {
  return new BuilderPipeline({
    builder: store.builder, json: store.json, media: store.media, knowledge: store.knowledge, learning: store.learning, queue: store.queue, cache: store.cache,
    hash: (value) => sha256(canonicalJson(value)), validate: validateKnowledge,
    spec: options.spec ?? loadQcSpec(), playbookVersion: loadPlaybook().playbook_version,
    contextPolicyVersion: options.contextPolicyVersion ?? 'context-policy-1', now: store.now,
  });
}
