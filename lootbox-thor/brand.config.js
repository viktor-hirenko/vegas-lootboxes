// Everything core/runtime.js needs to know about Thor. The runtime never reaches
// past this object into the brand folder.

import { PRIZE } from './vocabulary.js';
import { renderInner, cardClasses } from './render.js';
import { startOpenCharge, playOpenReveal, playMissedBurn } from './open.js';

export const brand = Object.freeze({
  id: 'thor',
  prize: PRIZE,
  skeleton: Object.freeze({
    mark: './assets/images/logo-thor.webp',
    markWidth: 128,
    markHeight: 128,
  }),
  renderInner,
  cardClasses,
  startOpenCharge,
  playOpenReveal,
  playMissedBurn,
});
