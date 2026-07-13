// Thin postMessage wrapper shared by both directions of the protocol.
// Message shape is always `{ type: string, data?: unknown }`.

function isPlainObject(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * Validate and canonicalize an origin (e.g. from the `origin` query param).
 * Returns the canonical origin ("https://site.com") for a valid absolute URL,
 * or '' when the value is missing/invalid or the wildcard '*'. An empty result
 * means "no restriction" (permissive mode).
 *
 * @param {string} [rawOrigin]
 * @returns {string}
 */
export function normalizeOrigin(rawOrigin) {
  if (!rawOrigin || rawOrigin === '*') return '';
  try {
    return new URL(rawOrigin).origin;
  } catch {
    return '';
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.allowedOrigin] parent origin (from the `origin` query
 *   param). When it is a valid absolute origin the bus runs in **strict** mode:
 *   incoming messages are accepted only from that origin, and outgoing messages
 *   are targeted only at it. When missing/invalid the bus runs in **permissive**
 *   mode ('*') — acceptable for the local sandbox, but production MUST pass a
 *   valid `origin` so the widget is not addressable by arbitrary parents.
 * @param {boolean} [options.debug] warn once when running in permissive mode.
 */
export function createMessageBus({ allowedOrigin = '', debug = false } = {}) {
  const targetOrigin = normalizeOrigin(allowedOrigin);
  const isStrict = targetOrigin !== '';

  if (!isStrict && debug) {
    // eslint-disable-next-line no-console
    console.warn(
      '[vegas-lootboxes-widget] no valid `origin` param — postMessage runs in permissive mode (*). ' +
        'Pass origin=<parent-origin> in the iframe URL for production.',
    );
  }

  const handlers = new Map();

  function isAllowedSource(event) {
    if (event.source !== window.parent) return false;
    if (isStrict && event.origin !== targetOrigin) return false;
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

  /** Send a message to the parent window. No-op outside an iframe. In strict
   * mode the message is targeted at the allowed origin; otherwise at '*'. */
  function postToParent(type, data) {
    if (!window.parent || window.parent === window) return;
    window.parent.postMessage({ type, data }, isStrict ? targetOrigin : '*');
  }

  function attach() {
    window.addEventListener('message', handleMessage);
  }

  function detach() {
    window.removeEventListener('message', handleMessage);
  }

  return { on, postToParent, attach, detach, origin: targetOrigin, isStrict };
}
