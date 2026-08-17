// Everything core/runtime.js needs to know about Thor. The runtime never reaches
// past this object into the brand folder.

import { PRIZE } from './vocabulary.js';
import { renderInner, cardClasses, onCardMounted } from './render.js';
import { startOpenCharge, playOpenReveal, playMissedBurn } from './open.js';

export const brand = Object.freeze({
  id: 'b2',
  prize: PRIZE,
  skeleton: Object.freeze({
    mark: './assets/images/logo.webp',
    markWidth: 128,
    markHeight: 128,
  }),
  renderInner,
  cardClasses,
  onCardMounted,
  startOpenCharge,
  playOpenReveal,
  playMissedBurn,
});
