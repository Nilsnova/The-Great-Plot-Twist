// The second wave of defenses (T43, decision D048 proposed; specs/T43-new-defenses.md), as plain data the
// combat simulation can read. Nothing imports this into src/pirates/sim.js yet: the culverin stays out of the
// game until the integration step wires it in (the "Sim wiring note" of the spec) and the feature flag
// defenses_v2 is switched on. No DOM, no randomness, no side effects.
//
// The culverin: a long gun for a tower spot. It reaches further than any other tower and hits hard, but it
// reloads slowly, cannot hit ships closer than `minRange` and never aims at boarders. It goes for the ships that
// attack towers first (`priority`: the gunboat of T2 and the siege barge of the wave events), then for the
// ship with the most hp left (the heavy hulls). Numbers per level, index 0 = level 1, in the same units as
// CONFIG.levels.cannon in sim.js (damage per shot, range in world units, reload in seconds before the pace of 0.7).
export const DEFENSES_V2 = Object.freeze({
  culverin: Object.freeze({
    levels: Object.freeze([
      Object.freeze({damage: 30, range: 44, reload: 4.0}),
      Object.freeze({damage: 42, range: 46, reload: 3.7}),
      Object.freeze({damage: 58, range: 48, reload: 3.4}),
      Object.freeze({damage: 76, range: 50, reload: 3.1}),
      Object.freeze({damage: 96, range: 52, reload: 2.8}),
    ]),
    minRange: 12,      // ships closer than this are the cannons' job
    shotSpeed: 60,     // units a second; the shot always hits (no dice), like the harpoon
    firstReload: 1.5,  // seconds before the first shot of a wave
    priority: Object.freeze(['gunboat', 'barge']), // ship kinds it shoots first, in range
    boarders: false,   // never aims at boarders
    watchtowerRange: false, // a watchtower's range bonus does not reach it (it would cover the whole sea)
    watchtowerBoost: true,  // a watchtower's damage boost (levels 3 to 5) does
    gunner: false,     // gunners stay on cannons and mortars
    hpShare: 0.7,      // T33: 70% of a same-level cannon's hp; destroyed, it stops firing until rebuilt (T30–T32)
  }),
});

export const DEFENSE_V2_KINDS = Object.freeze(Object.keys(DEFENSES_V2));
