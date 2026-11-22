// SSE bridge: one ReadableStream per race, fed ONLY by bus events tagged with this race's id.
import { randomUUID } from 'node:crypto';
import type { SseEvent, TaskSpec } from '../contracts/contract.js';
import type { RacingAgent } from './adapters.js';
import { bus, race, withRace } from './runner.js';
import { envFactoryFor } from './registry.js';

const HEARTBEAT_MS = 15_000;

export function raceStreamResponse(task: TaskSpec, lanes: RacingAgent[]): Response {
  const raceId = randomUUID();
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => { if (!closed) { try { controller.enqueue(enc.encode(chunk)); } catch { /* client gone */ } } };
      const onEvent = (e: SseEvent, id: string | undefined) => {
        if (id !== raceId) return;                 // another race's event — ignore
        send(`data: ${JSON.stringify(e)}\n\n`);
        if (e.t === 'race_done') finish();
      };
      const hb = setInterval(() => send(': hb\n\n'), HEARTBEAT_MS);
      const finish = () => {
        if (closed) return;
        cleanup();
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      };
      cleanup = () => { bus.off('sse', onEvent); clearInterval(hb); };

      // Subscribe BEFORE starting so step_started for i=0 is never missed.
      bus.on('sse', onEvent);
      send(`: race ${raceId} task ${task.id} lanes ${lanes.map(l => l.id).join(',')}\n\n`);
      withRace(raceId, () => race(envFactoryFor(task), task, lanes)).catch(err => {
        send(`event: error\ndata: ${JSON.stringify({ error: String(err).slice(0, 200) })}\n\n`);
        finish();
      });
    },
    cancel() { cleanup(); }, // client disconnected: stop forwarding; the race still finishes and is cached
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
      'x-race-id': raceId,
    },
  });
}
