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
const toOpenAiMsgs = (system: string, ts: Msg[]) => [
  { role: 'system', content: system },
  ...ts.map(m => m.role === 'tool'
    ? { role: 'user', content: `TOOL RESULT: ${m.content}` }
    : m.toolCall
      ? { role: 'assistant', content: `(called ${m.toolCall.name} ${JSON.stringify(m.toolCall.args)})` }
      : { role: m.role, content: m.content }),
];

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

function anthropicAgent(model: string): RacingAgent {
  return {
    id: 'claude', name: 'Claude', kind: 'frontier',
    async next(system, transcript, tools) {
      const data = await post('https://api.anthropic.com/v1/messages', {
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '', 'anthropic-version': '2023-06-01',
      }, {
        model, max_tokens: 1024, system,
        tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })),
        messages: (transcript.length ? transcript : [{ role: 'user' as const, content: 'Begin the task now.' }]).map(m =>
          m.role === 'tool' ? { role: 'user', content: `TOOL RESULT: ${m.content}` }
          : m.role === 'assistant' ? { role: 'assistant', content: m.toolCall ? `(called ${m.toolCall.name} ${JSON.stringify(m.toolCall.args)})` : (m.content || '...') }
          : { role: 'user', content: m.content }),
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
  if (process.env.OPENAI_API_KEY) lanes.push(openAiCompatible('gpt', 'GPT', 'https://api.openai.com/v1', process.env.OPENAI_MODEL ?? 'gpt-5.2', 'OPENAI_API_KEY'));
  if (process.env.GEMINI_API_KEY) lanes.push(openAiCompatible('gemini', 'Gemini', 'https://generativelanguage.googleapis.com/v1beta/openai', process.env.GEMINI_MODEL ?? 'gemini-2.5-pro', 'GEMINI_API_KEY'));
  if (process.env.SARVAM_API_KEY) lanes.push(openAiCompatible('sarvam', 'Sarvam', 'https://api.sarvam.ai/v1', process.env.SARVAM_MODEL ?? 'sarvam-105b', 'SARVAM_API_KEY', k => ({ 'api-subscription-key': k })));
  if (process.env.FIREWORKS_API_KEY) lanes.push(openAiCompatible('fireworks', 'Fireworks', 'https://api.fireworks.ai/inference/v1', process.env.FIREWORKS_MODEL ?? 'accounts/fireworks/models/llama-v3p3-70b-instruct', 'FIREWORKS_API_KEY'));
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
