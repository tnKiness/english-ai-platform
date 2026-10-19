export interface ItemView {
  item_id: string; prompt: string; learner_resource_ids: string[];
  answer: string; explanation: string; hidden_target: string;
}
// Whitelist projection. Resource authorization must happen before loading these IDs in P1/P2.
export function blindContext(item: ItemView) {
  return { item_id: item.item_id, prompt: item.prompt, resource_ids: [...item.learner_resource_ids] };
}
