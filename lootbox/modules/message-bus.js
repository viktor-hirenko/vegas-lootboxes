// Thin postMessage wrapper shared by both directions of the protocol.
// Message shape is always `{ type: string, data?: unknown }`.

function isPlainObject(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * @param {object} [options]
 * @param {string} [options.allowedOrigin] restrict incoming messages to this
 *   origin (from the `origin` query param) and use it as the default target
 *   origin for outgoing messages. Falls back to '*' when not provided —
 *   acceptable for a draft/sandbox integration, tighten for production.
 */
export function createMessageBus({ allowedOrigin = '' } = {}) {
  const handlers = new Map();

  function isAllowedSource(event) {
    if (event.source !== window.parent) return false;
    if (allowedOrigin && event.origin !== allowedOrigin) return false;
    return true;
  }

  function handleMessage(event) {
    if (!isAllowedSource(event)) return;
    if (!isPlainObject(event.data)) return;

    const { type, data } = event.data;
    const handler = type ? handlers.get(type) : undefined;
    if (typeof handler === 'function') handler(data, event);
  }

  /** Register (or replace) the handler for an incoming message type. */
  function on(type, handler) {
    handlers.set(type, handler);
  }

  /** Send a message to the parent window. No-op outside an iframe. */
  function postToParent(type, data, targetOrigin = allowedOrigin || '*') {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({ type, data }, targetOrigin);
  }

  function attach() {
    window.addEventListener('message', handleMessage);
  }

  function detach() {
    window.removeEventListener('message', handleMessage);
  }

  return { on, postToParent, attach, detach };
}
