// BHARAT GYM - contract v1. FROZEN. All money in integer PAISE.
export type EnvId = 'kirana-v1' | 'gst-filing-v1' | 'upi-dispute-v1';
export type Split = 'TRAIN' | 'HELD_OUT' | 'AUDIENCE';
export interface ToolDef { name: string; description: string; parameters: Record<string, unknown>; }
export interface TaskSpec { id: string; envId: EnvId; split: Split; title: string; prompt: string;
  expected: Record<string, unknown>; contributor?: string; }
export interface Observation { text: string; state?: Record<string, unknown>; }
export interface ToolCall { name: string; args: Record<string, unknown>; }
export interface StepLog { i: number; call: ToolCall; obs: string; latencyMs: number; }
export interface CheckResult { ruleId: string; label: string; passed: boolean; reason: string; weight: number; }
export interface Grade { score: number; checks: CheckResult[]; }
export interface BharatEnv { id: EnvId; tools: ToolDef[];
  reset(task: TaskSpec): Observation; step(call: ToolCall): Observation;
  finalState(): Record<string, unknown>; grade(task: TaskSpec): Grade; }
export interface AgentEntry { id: string; name: string; kind: 'frontier' | 'floor';
  config: { model: string; system?: string } | { url: string }; }
export interface Rollout { runId: string; envId: EnvId; taskId: string; agentId: string;
  steps: StepLog[]; finalClaimText: string; finalState: Record<string, unknown>;
  score: number; checks: CheckResult[]; graderVersion: string; totalLatencyMs: number;
  isCached?: boolean; shareId: string; }
export type SseEvent =
  | { t: 'step_started'; agentId: string; i: number }
  | { t: 'tool_result'; agentId: string; step: StepLog }
  | { t: 'model_claimed_done'; agentId: string; claim: string }
  | { t: 'grader_verdict'; agentId: string; rollout: Rollout }
  | { t: 'race_done'; rollouts: { agentId: string; score: number; shareId: string }[] };
export const paise = (rsAmt: number) => Math.round(rsAmt * 100);
export const toRs = (p: number) => (p / 100).toFixed(2);
