// Shared market entry consumed by the game Harbor host.
import {createSharedWagerCard} from './shared-wager-card.js';
export const createSharedMarketEntry = ctx => createSharedWagerCard(ctx, 'market_call');
