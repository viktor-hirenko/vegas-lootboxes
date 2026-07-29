// Vegas Lootboxes brand adapter.
//
// The single object the core runtime consumes. Everything Vegas-specific — art
// vocabulary, markup, open animation — is reached only through here.

import { PRIZE } from './vocabulary.js';
import { renderInner, cardClasses, onCardMounted } from './render.js';
import { startOpenCharge, playOpenReveal } from './open.js';

export const brand = Object.freeze({
  id: 'vegas',
  prize: PRIZE,

  skeleton: Object.freeze({
    mark: './assets/images/logo-vegas.webp',
    markWidth: 147,
    markHeight: 128,
  }),

  renderInner,
  cardClasses,
  onCardMounted,
  startOpenCharge,
  playOpenReveal,
})
