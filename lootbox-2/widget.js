// Thor Lootboxes widget entry point.
//
// Everything brand-agnostic lives in ../core/; everything Thor-specific is
// reached through brand.config.js. See /INTEGRATION.md for the protocol.

import { createWidget } from '../core/runtime.js';
import { brand } from './brand.config.js';

createWidget(brand);
