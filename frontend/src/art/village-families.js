// Coordinator-owned registrations for the approved world-only art. Importing metadata loads no image.
import * as buildings from './village/buildings.js';
import * as houses from './village/houses.js';
import * as nature from './village/nature.js';
import * as landmarks from './village/landmarks.js';

import * as services from './village/services.js';
import * as cannons from './village/cannons.js';
import * as walls from './village/walls.js';
import * as core from './village/core.js';
import * as progress from './village/progress.js';

export const villageFamilies = [buildings, houses, nature, landmarks, services, cannons, walls, core, progress];
