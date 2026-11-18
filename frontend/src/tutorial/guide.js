// The narrator and the tutorials (guided start, unlock cards): one chunk that game.js loads right after its
// first frame (core/lazy-part.js), so they stay out of the Play chunk.
export {createNarrator} from '../narrator/index.js';
export {createTutorials} from './tutorials.js';
