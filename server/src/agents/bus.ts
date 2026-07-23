import type { SessionEvent } from "./orchestrator.js";

/**
 * Per-session event bus. Each session buffers all its events and lets any
 * number of SSE listeners subscribe (with automatic replay of prior events).
 * Buffers are dropped 5 minutes after the session completes.
 */
interface SessionBus {
  events: SessionEvent[];
  listeners: Set<(e: SessionEvent) => void>;
  done: boolean;
}

const buses = new Map<string, SessionBus>();

function getBus(id: string): SessionBus {
  let b = buses.get(id);
  if (!b) {
    b = { events: [], listeners: new Set(), done: false };
    buses.set(id, b);
  }
  return b;
}

export function emit(id: string, event: SessionEvent): void {
  const b = getBus(id);
  b.events.push(event);
  for (const l of b.listeners) {
    try {
      l(event);
    } catch {
      /* listener error should not kill the bus */
    }
  }
  if (event.type === "session.completed" || event.type === "session.error") {
    b.done = true;
    setTimeout(() => buses.delete(id), 5 * 60 * 1000).unref?.();
  }
}

export function subscribe(
  id: string,
  onEvent: (e: SessionEvent) => void,
): { close: () => void; replay: SessionEvent[]; done: boolean } {
  const b = getBus(id);
  // Snapshot the buffered events BEFORE attaching the listener so we can
  // replay history without also double-delivering any events that arrive
  // between snapshot and listener attachment.
  const replay = [...b.events];
  b.listeners.add(onEvent);
  return {
    replay,
    done: b.done,
    close: () => {
      b.listeners.delete(onEvent);
    },
  };
}
