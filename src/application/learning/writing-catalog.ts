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

export type WritingOrigin = 'ai_authored' | 'learner_owned';
export interface AiWritingItem {
  id: string; version: string; package: { id: string; version: string }; origin: WritingOrigin;
  /** E-52: 'speaking_text' = a Speaking part answered in writing (E-43). */
  task_type: 'writing_task2' | 'speaking_text'; skill: 'writing' | 'speaking_text';
  title: string; topic: string; genre: string; genre_label: string; prompt: string; family: string;
  competencies: string[]; min_words: number; estimated_minutes: number;
  task_scope: TaskBreadth; constraint: ConstraintKind; rubric: { id: string; version: string }; framework_version: string | null;
}

export const GENRE_LABEL: Record<string, string> = {
  opinion: 'Opinion / Agree–Disagree (Task 2)', discussion: 'Discussion + Opinion (Task 2)', advantages_disadvantages: 'Advantages / Disadvantages (Task 2)',
  problem_solution: 'Problem / Solution (Task 2)', two_part: 'Two-part question (Task 2)',
  part1: 'Speaking Part 1 (trả lời bằng văn bản)', part2: 'Speaking Part 2 — bài nói dài (trả lời bằng văn bản)', part3: 'Speaking Part 3 — thảo luận (trả lời bằng văn bản)',
};
const ESSAY_MINUTES = 40;
const PARAGRAPH_MINUTES = 15;

interface ItemUnit {
  governance: { scope: { skills: string[]; task_types: string[]; context: string }; identity: { unit_type: string } };
  body: { item_family_id: string; decisive_features: string[]; prompt: string; questions: { prompt: string; response_type: string }[] };
}

/**
 * Metadata of one AI-authored (E-47) or learner-owned (E-51) Writing Task 2 item, or undefined when it is neither
 * (synthetic, reading, unknown…). Both are packaged the same way by the Builder pipeline.
 */
export function aiWritingItem(store: Store, id: string, version: string): AiWritingItem | undefined {
  let origin: WritingOrigin | undefined;
  const pkg = store.builder.packagesOf('item', id, version).find((p) => {
    const o = store.builder.bundle(p.id, p.version)?.content_origin;
    if (o === 'ai_authored' || o === 'learner_owned') { origin = o; return true; }
    return false;
  });
  if (!pkg || !origin) return undefined;
  const units = store.builder.packageUnits(pkg.id, pkg.version);
  const reader = scopedReader('assessor', store.builder, { get: (k, i, v, h) => store.json.get(k, i, v, h) });
  let item: ItemUnit;
  try { item = reader.read('item', id, version).value as ItemUnit; } catch { return undefined; }
  const speaking = item.governance.scope.task_types.includes('speaking_text') && item.governance.scope.skills.includes('speaking');
  const writing = item.governance.scope.task_types.includes('writing_task2') && item.governance.scope.skills.includes('writing');
  if (item.governance.identity.unit_type !== 'task_item' || !(speaking || writing)) return undefined;
  const essay = item.body.questions.find((q) => q.response_type === 'essay');
  if (!essay) return undefined;
  const keyUnit = units.find((u) => u.unit_type === 'answer_key');
  const rubric = units.find((u) => u.kind === 'rubric');
  if (!keyUnit || !rubric) return undefined;
  const key = reader.read(keyUnit.kind, keyUnit.id, keyUnit.version).value as { body: { item: { id: string; version: string }; measurement_targets: string[] } };
  if (key.body.item.id !== id || key.body.item.version !== version) return undefined;
  const [genre = 'unknown', topic = id] = item.body.decisive_features;
  const fw = /framework \S+@(v\d+)/.exec(item.governance.scope.context);
  // E-50: a paragraph task is a short 7A transfer task (D-02 A4: short breadth), aimed at one competency.
  const paragraph = item.governance.scope.task_types.includes('paragraph');
  return {
    id, version, package: pkg, origin, task_type: speaking ? 'speaking_text' : 'writing_task2', skill: speaking ? 'speaking_text' : 'writing',
    title: speaking ? `Speaking ${genre === 'part1' ? 'Part 1' : genre === 'part2' ? 'Part 2' : 'Part 3'} — ${topic}` : `Writing Task 2${paragraph ? ' (đoạn)' : ''} — ${topic}`, topic, genre, genre_label: GENRE_LABEL[genre] ?? genre, prompt: item.body.prompt,
    family: item.body.item_family_id, competencies: key.body.measurement_targets, min_words: Number(/(\d+)\s+words/.exec(essay.prompt)?.[1] ?? (paragraph ? 100 : 250)),
    estimated_minutes: speaking ? (paragraph ? 8 : 15) : paragraph ? PARAGRAPH_MINUTES : ESSAY_MINUTES, task_scope: paragraph ? 'short' : 'composite', constraint: 'semantic',
    rubric: { id: rubric.id, version: rubric.version }, framework_version: fw?.[1] ?? null,
  };
}

/**
 * Released Writing Task 2 items the learner may be served now, of the given origins. Verification and N8 coverage
 * use AI-authored items only: a learner-owned prompt was seen when it was typed in.
 */
export function servableAiWritingItems(store: Store, origins: readonly WritingOrigin[] = ['ai_authored']): AiWritingItem[] {
  const out: AiWritingItem[] = [];
  for (const b of store.builder.bundles()) {
    if (!(origins as readonly string[]).includes(b.content_origin) || store.knowledge.releaseState(b.package_id, b.version) !== 'active') continue;
    for (const u of store.builder.packageUnits(b.package_id, b.version).filter((x) => x.kind === 'item')) {
      if (!store.knowledge.servableItem(u.id, u.version, 'learner').ok) continue;
      const meta = aiWritingItem(store, u.id, u.version);
      if (meta) out.push(meta);
    }
  }
  return out;
}
