// ĐỒNG BỘ TỪ ai-router/src/core — KHÔNG sửa tay. Sửa ở ai-router rồi chạy `npm run router:sync` (E-24).
// Shared domain types. Pure: no I/O.

/** How a provider is reached: the CLI of a subscription (user logged in) or a paid API key. */
export type ProviderKind = 'claude-cli' | 'codex-cli' | 'agy-cli' | 'anthropic-api' | 'openai-api';
export const PROVIDER_KINDS: readonly ProviderKind[] = ['claude-cli', 'codex-cli', 'agy-cli', 'anthropic-api', 'openai-api'];
export const isCliKind = (k: ProviderKind) => k.endsWith('-cli');
export const billingOf = (k: ProviderKind): 'subscription' | 'api' => (isCliKind(k) ? 'subscription' : 'api');

/**
 * Workspace trust (like Claude Code's "trust this folder"), granted by the user in Admin:
 * read  – may read files only;
 * edit  – may read and edit files, run only allow-listed commands;
 * full  – no permission prompts and no sandbox (the CLI's bypass mode). Only for folders the user fully trusts.
 */
export type TrustLevel = 'read' | 'edit' | 'full';
export const TRUST_LEVELS: readonly TrustLevel[] = ['read', 'edit', 'full'];
/** What a run asks for; it is capped by the workspace's trust level. */
export type RunMode = 'chat' | TrustLevel;

/** UNAVAILABLE: the provider's side is down or unreachable (HTTP 5xx, network); worth trying another provider. */
export type FailureClass = 'QUOTA' | 'RATE_LIMIT' | 'AUTH' | 'UNAVAILABLE' | 'TIMEOUT' | 'ERROR';
export type SwitchFailure = Exclude<FailureClass, 'ERROR'>;

export type Outcome =
  | { kind: 'DONE' }
  | { kind: 'SWITCH'; failure: SwitchFailure; resetAt: Date | null }
  | { kind: 'STOP'; reason: string };

export type HealthStatus = 'READY' | 'COOLDOWN' | 'NEEDS_LOGIN' | 'DISABLED';
export interface ProviderHealth { status: HealthStatus; until: string | null; reason: string | null }

/** Structured progress emitted while a provider runs; this is what the activity log and chat timeline show. */
export type AgentEvent =
  | { type: 'session'; sessionId: string; model?: string }
  | { type: 'thinking'; text: string }
  | { type: 'text'; text: string }
  /** A piece of the answer as it is written. Live only: passed to listeners, never stored in the activity log. */
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; tool: string; summary: string; input?: unknown; callId?: string }
  | { type: 'tool_result'; tool?: string; ok: boolean; summary: string; callId?: string }
  | { type: 'file_edit'; path: string; action: 'create' | 'edit' | 'delete' | 'unknown' }
  | { type: 'command'; command: string; exitCode?: number | null }
  | { type: 'quota'; state: 'warning' | 'rejected'; resetAt: string | null; detail?: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; costUsd?: number }
  | { type: 'diagnostic'; text: string };
