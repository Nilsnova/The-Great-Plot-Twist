// Shared football entry consumed by the game Harbor host.
import {createSharedWagerCard} from './shared-wager-card.js';
export const createSharedMatchEntry = ctx => createSharedWagerCard(ctx, 'football');
