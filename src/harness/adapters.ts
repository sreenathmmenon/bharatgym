// Model adapters — one interface, four providers + scripted + floor entries.
// Keys come from env vars on the deploy host. NEVER hardcode keys.
import { ToolDef, ToolCall } from '../contracts/contract.js';

export interface AgentTurn { call?: ToolCall; finalText?: string; }
export interface RacingAgent {
  id: string; name: string; kind: 'frontier' | 'floor' | 'scripted';
  next(system: string, transcript: Msg[], tools: ToolDef[]): Promise<AgentTurn>;
}
export interface Msg { role: 'user' | 'assistant' | 'tool'; content: string; toolCall?: ToolCall; }

const TIMEOUT_MS = 15000;
async function post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    if (!r.ok) throw new Error(`${url.split('/')[2]} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

const toOpenAiTools = (tools: ToolDef[]) => tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
const toOpenAiMsgs = (system: string, ts: Msg[]) => {
  // Native tool-calling transcript: assistant turns carry tool_calls, results use the
  // tool role. Flattening calls into "(called ...)" text teaches models to parrot the
  // format as plain text instead of calling tools - observed live with gpt/kimi lanes.
  const out: Record<string, unknown>[] = [{ role: 'system', content: system }];
  let pendingCallId: string | null = null;
  let n = 0;
  for (const m of ts) {
    if (m.role === 'assistant' && m.toolCall) {
      pendingCallId = `call_${++n}`;
      out.push({
        role: 'assistant', content: m.content || null,
        tool_calls: [{ id: pendingCallId, type: 'function', function: { name: m.toolCall.name, arguments: JSON.stringify(m.toolCall.args) } }],
      });
    } else if (m.role === 'tool') {
      if (pendingCallId) { out.push({ role: 'tool', tool_call_id: pendingCallId, content: m.content }); pendingCallId = null; }
      else out.push({ role: 'user', content: `TOOL RESULT: ${m.content}` });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
};

function openAiCompatible(id: string, name: string, baseUrl: string, model: string, keyEnv: string, headers?: (key: string) => Record<string, string>): RacingAgent {
  return {
    id, name, kind: 'frontier',
    async next(system, transcript, tools) {
      const key = process.env[keyEnv] ?? '';
      const data = await post(`${baseUrl}/chat/completions`, headers ? headers(key) : { authorization: `Bearer ${key}` }, {
        model, messages: toOpenAiMsgs(system, transcript), tools: toOpenAiTools(tools), temperature: 0.2,
      });
      const m = data.choices?.[0]?.message;
      const tc = m?.tool_calls?.[0];
      if (tc) return { call: { name: tc.function.name, args: JSON.parse(tc.function.arguments || '{}') } };
      return { finalText: m?.content ?? '' };
    },
  };
}

function toAnthropicMsgs(ts: Msg[]): Record<string, unknown>[] {
  // Native tool-calling blocks: assistant turns carry tool_use, results come back
  // as tool_result user blocks. Text-flattened transcripts teach models to parrot.
  const out: Record<string, unknown>[] = [];
  let pendingId: string | null = null;
  let n = 0;
  for (const m of ts) {
    if (m.role === 'assistant' && m.toolCall) {
      pendingId = `toolu_${++n}`;
      out.push({ role: 'assistant', content: [
        ...(m.content ? [{ type: 'text', text: m.content }] : []),
        { type: 'tool_use', id: pendingId, name: m.toolCall.name, input: m.toolCall.args },
      ] });
    } else if (m.role === 'tool') {
      if (pendingId) { out.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: pendingId, content: m.content }] }); pendingId = null; }
      else out.push({ role: 'user', content: `TOOL RESULT: ${m.content}` });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  if (!out.length) out.push({ role: 'user', content: 'Begin the task now.' });
  return out;
}

function anthropicAgent(model: string): RacingAgent {
  return {
    id: 'claude', name: 'Claude', kind: 'frontier',
    async next(system, transcript, tools) {
      const data = await post('https://api.anthropic.com/v1/messages', {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01',
      }, {
        model, max_tokens: 1024, system,
        tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        messages: toAnthropicMsgs(transcript),
      });
      const tu = (data.content ?? []).find((c: any) => c.type === 'tool_use');
      if (tu) return { call: { name: tu.name, args: tu.input ?? {} } };
      const tx = (data.content ?? []).find((c: any) => c.type === 'text');
      return { finalText: tx?.text ?? '' };
    },
  };
}

export function frontierLanes(): RacingAgent[] {
  const lanes: RacingAgent[] = [];
  if (process.env.ANTHROPIC_API_KEY) lanes.push(anthropicAgent(process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5'));
  if (process.env.OPENAI_API_KEY) lanes.push(openAiCompatible('gpt', 'GPT', 'https://api.openai.com/v1', process.env.OPENAI_MODEL ?? 'gpt-5.4', 'OPENAI_API_KEY'));
  if (process.env.GEMINI_API_KEY) lanes.push(openAiCompatible('gemini', 'Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', process.env.GEMINI_MODEL ?? 'gemini-2.5-pro', 'GEMINI_API_KEY'));
  if (process.env.SARVAM_API_KEY) lanes.push(openAiCompatible('sarvam', 'Sarvam', 'https://api.sarvam.ai/v1', process.env.SARVAM_MODEL ?? 'sarvam-105b', 'SARVAM_API_KEY', k => ({ 'api-subscription-key': k })));
  if (process.env.FIREWORKS_API_KEY) lanes.push(openAiCompatible('fireworks', 'Fireworks', 'https://api.fireworks.ai/inference/v1', process.env.FIREWORKS_MODEL ?? 'accounts/fireworks/models/kimi-k3', 'FIREWORKS_API_KEY'));
  // ANY other provider (Modal endpoint, Together, Groq, a self-hosted vLLM...) via one env var:
  // EXTRA_LANES='[{"id":"modal","name":"Modal Llama","baseUrl":"https://xx.modal.run/v1","model":"...","keyEnv":"MODAL_API_KEY"}]'
  try {
    const extra = JSON.parse(process.env.EXTRA_LANES ?? '[]') as { id: string; name: string; baseUrl: string; model: string; keyEnv: string }[];
    for (const x of extra) if (process.env[x.keyEnv]) lanes.push(openAiCompatible(x.id, x.name, x.baseUrl, x.model, x.keyEnv));
  } catch { /* malformed EXTRA_LANES ignored */ }
  return lanes;
}

// Floor entry: prompt+model reuses a frontier adapter with custom system; endpoint gets POST {system, transcript, tools}
export function floorAgent(entry: { id: string; name: string; config: any }): RacingAgent {
  if ('url' in entry.config) {
    return {
      id: entry.id, name: entry.name, kind: 'floor',
      async next(system, transcript, tools) {
        const data = await post(entry.config.url, {}, { system, transcript, tools });
        return data.call ? { call: data.call } : { finalText: data.finalText ?? '' };
      },
    };
  }
  const base = frontierLanes().find(l => l.id === entry.config.model) ?? frontierLanes()[0];
  return {
    id: entry.id, name: entry.name, kind: 'floor',
    next: (system, transcript, tools) => base.next(`${system}\n\nBUILDER INSTRUCTIONS:\n${entry.config.system ?? ''}`, transcript, tools),
  };
}
