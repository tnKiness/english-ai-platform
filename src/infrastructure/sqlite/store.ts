import type { UnitOfWork } from '../../application/ports.js';
import { JsonStore } from '../files/json-store.js';
import { MediaStore } from '../files/media-store.js';
import { ensureDataDirs, type DataPaths } from '../files/paths.js';
import { openDatabase, type Db, type OpenOptions } from './database.js';
import { SqliteJobQueue } from './job-queue.js';
import { KnowledgeRepository } from './knowledge-repository.js';
import { LearningRepository } from './learning-repository.js';

export interface Store {
  db: Db; paths: DataPaths; uow: UnitOfWork;
  json: JsonStore; media: MediaStore; knowledge: KnowledgeRepository; learning: LearningRepository; queue: SqliteJobQueue;
  close(): void;
}

/** Composition root for persistence: one SQLite connection shared by all repositories. */
export async function openStore(paths: DataPaths, options: OpenOptions & { now?: () => Date } = {}): Promise<Store> {
  ensureDataDirs(paths);
  const now = options.now ?? (() => new Date());
  const db = await openDatabase(paths.db, options);
  const knowledge = new KnowledgeRepository(db, now);
  return {
    db, paths,
    uow: { run: <T>(fn: () => T): T => db.transaction(fn).immediate() },
    json: new JsonStore(db, paths.knowledge, paths.staging, now),
    media: new MediaStore(db, paths.media, paths.staging, now),
    knowledge,
    learning: new LearningRepository(db, knowledge, now),
    queue: new SqliteJobQueue(db, knowledge, now),
    close: () => db.close(),
  };
}
