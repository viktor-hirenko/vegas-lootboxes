// Unit tests for the postMessage bus origin handling. Runs on the built-in
// Node test runner (no dependencies): `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeOrigin, createMessageBus } from '../lootbox/modules/message-bus.js';

/** Minimal window stub: records outgoing postMessage and lets tests dispatch
 * incoming `message` events. `parent` is a distinct object so the bus can tell
 * it apart from the window itself. */
function makeFakeWindow() {
  const listeners = new Map();
  const sent = [];
  const parent = {
    postMessage: (message, targetOrigin) => sent.push({ message, targetOrigin }),
  };
  return {
    parent,
    sent,
    addEventListener: (type, handler) => {
      const list = listeners.get(type) ?? [];
      list.push(handler);
      listeners.set(type, list);
    },
    removeEventListener: (type, handler) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((h) => h !== handler));
    },
    dispatch: (type, event) => (listeners.get(type) ?? []).forEach((h) => h(event)),
  };
}

test('normalizeOrigin canonicalizes valid origins and rejects the rest', () => {
  assert.equal(normalizeOrigin('https://a.com'), 'https://a.com');
  assert.equal(normalizeOrigin('https://a.com/path?x=1#h'), 'https://a.com');
  assert.equal(normalizeOrigin('http://localhost:5173'), 'http://localhost:5173');
  assert.equal(normalizeOrigin(''), '');
  assert.equal(normalizeOrigin('*'), '');
  assert.equal(normalizeOrigin('not a url'), '');
  assert.equal(normalizeOrigin(undefined), '');
  assert.equal(normalizeOrigin(null), '');
});

test('strict mode accepts only messages from the allowed origin', () => {
  const win = makeFakeWindow();
  global.window = win;
  try {
    const bus = createMessageBus({ allowedOrigin: 'https://ok.com' });
    assert.equal(bus.isStrict, true);
    assert.equal(bus.origin, 'https://ok.com');

    const received = [];
    bus.on('ping', (data) => received.push(data));
    bus.attach();

    win.dispatch('message', {
      source: win.parent,
      origin: 'https://evil.com',
      data: { type: 'ping', data: 'blocked' },
    });
    win.dispatch('message', {
      source: win.parent,
      origin: 'https://ok.com',
      data: { type: 'ping', data: 'allowed' },
    });

    assert.deepEqual(received, ['allowed']);
  } finally {
    delete global.window;
  }
});

test('strict mode ignores messages from a source other than the parent', () => {
  const win = makeFakeWindow();
  global.window = win;
  try {
    const bus = createMessageBus({ allowedOrigin: 'https://ok.com' });
    const received = [];
    bus.on('ping', (data) => received.push(data));
    bus.attach();

    win.dispatch('message', {
      source: {}, // not window.parent
      origin: 'https://ok.com',
      data: { type: 'ping', data: 'nope' },
    });

    assert.equal(received.length, 0);
  } finally {
    delete global.window;
  }
});

test('strict mode targets outgoing messages at the allowed origin', () => {
  const win = makeFakeWindow();
  global.window = win;
  try {
    const bus = createMessageBus({ allowedOrigin: 'https://ok.com' });
    bus.postToParent('resize', { height: 42 });

    assert.equal(win.sent.length, 1);
    assert.equal(win.sent[0].targetOrigin, 'https://ok.com');
    assert.deepEqual(win.sent[0].message, { type: 'resize', data: { height: 42 } });
  } finally {
    delete global.window;
  }
});

test('permissive mode accepts any origin and posts to *', () => {
  const win = makeFakeWindow();
  global.window = win;
  try {
    const bus = createMessageBus({ allowedOrigin: '' });
    assert.equal(bus.isStrict, false);

    const received = [];
    bus.on('ping', (data) => received.push(data));
    bus.attach();

    win.dispatch('message', {
      source: win.parent,
      origin: 'https://anything.com',
      data: { type: 'ping', data: 'ok' },
    });
    bus.postToParent('resize', { height: 10 });

    assert.deepEqual(received, ['ok']);
    assert.equal(win.sent[0].targetOrigin, '*');
  } finally {
    delete global.window;
  }
});

test('an invalid origin falls back to permissive mode', () => {
  const win = makeFakeWindow();
  global.window = win;
  try {
    const bus = createMessageBus({ allowedOrigin: 'garbage' });
    assert.equal(bus.isStrict, false);
    assert.equal(bus.origin, '');
  } finally {
    delete global.window;
  }
});
