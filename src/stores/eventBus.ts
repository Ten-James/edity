import type { EdityEvent } from "./events";

type Listener = (event: EdityEvent) => void;

const listeners = new Set<Listener>();

/**
 * Dispatch an event to all subscribers synchronously.
 * Stores update their Zustand state inside listeners,
 * which triggers React re-renders on the next microtask.
 */
export function dispatch(event: EdityEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch (err) {
      console.error(`[eventBus] Error handling ${event.type}:`, err);
    }
  }
}

/**
 * Subscribe to the full event stream.
 * Returns an unsubscribe function.
 */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Subscribe to a specific event type with narrowed typing.
 */
export function on<T extends EdityEvent["type"]>(
  type: T,
  handler: (event: Extract<EdityEvent, { type: T }>) => void,
): () => void {
  return subscribe((event) => {
    if (event.type === type) {
      handler(event as Extract<EdityEvent, { type: T }>);
    }
  });
}
