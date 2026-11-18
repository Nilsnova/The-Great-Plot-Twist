# Island combat readability

Standard cannonballs from village defenses leave a short warm gold trail. Incoming ship shots leave a copper trail. Both use the existing projected flight and keep a dark core. Reduced motion draws the core by itself. Reused render records retain their new projectile's type.

Fog Bank uses feathered blue-green banks. The existing tower and watchtower sight circles clear the strongest haze, leaving a trace of drift. The wave still uses the same sight, damage, projectile targets, impacts and rewards.

On a portrait phone the combat caption moves beside the stick so it leaves the island visible. The attack button stays below the measured wave bar. The narrow layout keeps the full text and a 44 × 44 Skip button. When the event disclosure changes the wave bar's height, the caption measures the new available space. The large-text setting retains the centered card.

| In-game evidence | Desktop 1280 × 720 | Phone 375 × 812 |
| --- | --- | --- |
| Projectile detail from matched shot events | [Cannon and ship](geschosse-desktop.png) | [Cannon and ship](geschosse-handy.png) |
| Same Fog Bank wave and frame | [Before and after](nebel-desktop.png) | [Before and after](nebel-handy.png) |
| Active combat controls | | [Before and after](kampf-handy.png) |
| Normal-motion game recording | [Wave 31 clip](gefecht-desktop.webm) | [Wave 31 clip](gefecht-handy.webm) |

Desktop fog was compared in wave 89 and the phone in wave 31. Both comparisons use the same game fixture and simulation time for each pair. Projectile comparisons pair exact event coordinates in wave 31. Flight phase differs by at most 0.5 percentage points on desktop and 1.8 on the phone. In six stress cases across waves 31, 85, 87 and 89, observed combat events and common sampled ticks matched. The three final fog comparisons stayed around 60 Hz on the M1 Max with matching draw calls and shader counts between paired runs. These are local browser samples.

The real wave 31 phone layout was checked at 320 × 568, 375 × 812 and 430 × 932. At 320 × 568 the full Redtide caption stayed clear of the controls through a real touch open and close of the Fog Bank disclosure. The player could reach the attack and Skip controls. Phone evidence uses Chrome touch emulation. [Short phone comparison](kampf-kurzformat.png) · [Expanded Fog Bank in the short layout](kampf-kurzformat-details.png)

The visual reference is [Clash Royale's separation of projectile, hit and atmosphere](https://www.youtube.com/watch?v=6o5oeDEgFws&t=79s).
