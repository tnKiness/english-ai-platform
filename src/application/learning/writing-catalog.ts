// E-49 (D-05 C3b): Writing Task 2 prompts the AI authored and the Builder pipeline released (E-47), read for the
// learner workflow. Metadata (title, genre, measured competencies, rubric) comes from the frozen package units:
// - the prompt from the task_item (learner-visible);
// - the measured competencies from the answer key, read through the assessor-scoped reader. They stay on the
//   server: the learner view never contains them.
// Metadata does not depend on the release state, so history of a later suspended or revoked prompt keeps its
// labels; whether a prompt can be served is decided separately by servableItem.
import { scopedReader } from '../context/scoped-reader.js';
import type { ConstraintKind, TaskBreadth } from '../../domain/policy/competency.js';
import type { Store } from '../../infrastructure/sqlite/store.js';

export interface AiWritingItem {
  id: string; version: string; package: { id: string; version: string };
  title: string; topic: string; genre: string; genre_label: string; prompt: string; family: string;
  competencies: string[]; min_words: number; estimated_minutes: number;
  task_scope: TaskBreadth; constraint: ConstraintKind; rubric: { id: string; version: string }; framework_version: string | null;
}

export const GENRE_LABEL: Record<string, string> = {
  opinion: 'Opinion / Agree–Disagree (Task 2)', discussion: 'Discussion + Opinion (Task 2)', advantages_disadvantages: 'Advantages / Disadvantages (Task 2)',
  problem_solution: 'Problem / Solution (Task 2)', two_part: 'Two-part question (Task 2)',
};
const ESSAY_MINUTES = 40;

interface ItemUnit {
  governance: { scope: { skills: string[]; task_types: string[]; context: string }; identity: { unit_type: string } };
  body: { item_family_id: string; decisive_features: string[]; prompt: string; questions: { prompt: string; response_type: string }[] };
}

/** Metadata of one AI-authored Writing Task 2 item, or undefined when it is not one (synthetic, reading, unknown…). */
export function aiWritingItem(store: Store, id: string, version: string): AiWritingItem | undefined {
  const pkg = store.builder.packagesOf('item', id, version).find((p) => store.builder.bundle(p.id, p.version)?.content_origin === 'ai_authored');
  if (!pkg) return undefined;
  const units = store.builder.packageUnits(pkg.id, pkg.version);
  const reader = scopedReader('assessor', store.builder, { get: (k, i, v, h) => store.json.get(k, i, v, h) });
  let item: ItemUnit;
  try { item = reader.read('item', id, version).value as ItemUnit; } catch { return undefined; }
  if (item.governance.identity.unit_type !== 'task_item' || !item.governance.scope.skills.includes('writing') || !item.governance.scope.task_types.includes('writing_task2')) return undefined;
  const essay = item.body.questions.find((q) => q.response_type === 'essay');
  if (!essay) return undefined;
  const keyUnit = units.find((u) => u.unit_type === 'answer_key');
  const rubric = units.find((u) => u.kind === 'rubric');
  if (!keyUnit || !rubric) return undefined;
  const key = reader.read(keyUnit.kind, keyUnit.id, keyUnit.version).value as { body: { item: { id: string; version: string }; measurement_targets: string[] } };
  if (key.body.item.id !== id || key.body.item.version !== version) return undefined;
  const [genre = 'unknown', topic = id] = item.body.decisive_features;
  const fw = /framework \S+@(v\d+)/.exec(item.governance.scope.context);
  return {
    id, version, package: pkg, title: `Writing Task 2 — ${topic}`, topic, genre, genre_label: GENRE_LABEL[genre] ?? genre, prompt: item.body.prompt,
    family: item.body.item_family_id, competencies: key.body.measurement_targets, min_words: Number(/(\d+)\s+words/.exec(essay.prompt)?.[1] ?? 250),
    estimated_minutes: ESSAY_MINUTES, task_scope: 'composite', constraint: 'semantic', rubric: { id: rubric.id, version: rubric.version }, framework_version: fw?.[1] ?? null,
  };
}

/** Every released AI-authored Writing Task 2 item the learner may be served now. */
export function servableAiWritingItems(store: Store): AiWritingItem[] {
  const out: AiWritingItem[] = [];
  for (const b of store.builder.bundles()) {
    if (b.content_origin !== 'ai_authored' || store.knowledge.releaseState(b.package_id, b.version) !== 'active') continue;
    for (const u of store.builder.packageUnits(b.package_id, b.version).filter((x) => x.kind === 'item')) {
      if (!store.knowledge.servableItem(u.id, u.version, 'learner').ok) continue;
      const meta = aiWritingItem(store, u.id, u.version);
      if (meta) out.push(meta);
    }
  }
  return out;
}
