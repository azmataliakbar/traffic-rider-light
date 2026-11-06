/**
 * In-app command router. Named commands, object payloads, and structured results.
 * Nothing thrown by a handler reaches the caller: every outcome is {ok, data} or {ok, error}.
 */

export const ErrorCode = Object.freeze({
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  HANDLER_FAILED: 'HANDLER_FAILED',
});

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

const fail = (code, message) => ({ ok: false, error: { code, message } });

export function createDispatcher() {
  const handlers = new Map();
  return {
    register(name, handler) {
      if (typeof name !== 'string' || name.length === 0) throw new TypeError('Command name must be a non-empty string');
      if (typeof handler !== 'function') throw new TypeError(`Handler for ${name} must be a function`);
      if (handlers.has(name)) throw new Error(`Command already registered: ${name}`);
      handlers.set(name, handler);
    },
    commands() {
      return [...handlers.keys()];
    },
    dispatch(name, payload = {}) {
      const handler = handlers.get(name);
      if (!handler) return fail(ErrorCode.UNKNOWN_COMMAND, `Unknown command: ${String(name)}`);
      if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return fail(ErrorCode.INVALID_PAYLOAD, 'Payload must be an object');
      }
      try {
        return { ok: true, data: handler(payload) ?? null };
      } catch (err) {
        if (err instanceof ValidationError) return fail(ErrorCode.INVALID_PAYLOAD, err.message);
        return fail(ErrorCode.HANDLER_FAILED, err?.message ?? 'Handler failed');
      }
    },
  };
}
