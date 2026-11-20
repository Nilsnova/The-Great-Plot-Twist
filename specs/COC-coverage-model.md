# Village approach coverage

In Village Mode, **Approach coverage** starts off. Select **Ground** or **Sea** to inspect gaps for that target type. The map samples the standard clear-weather approaches between waves. The sample locations and applicable ranges can change after a Move, upgrade, or health update.

- A filled square marks a point outside the effective attack range of every suitable operational defense in the available layout.
- A hollow diamond marks a point reached under an additional condition, such as illumination or a weapon finishing its reload, when the range data supplies that condition.
- A hollow square marks a point whose coverage is unknown. A route that cannot be resolved or an unavailable structure read can produce this mark.
- Covered points stay clear so the gaps are easy to see.

Ground samples reuse the battle guide's boarding routes, including their existing wall and breach behavior. Each of up to four routes uses at most 24 markers and the model adds one sample at the heart when a route reaches it. Sea samples use eight points per standard sailing centerline, up to four lanes. These points represent approaching ships. A wave may choose different landing or sailing paths.

The geometry uses the same primary target classes, dead zones, upgrade trees and supported lookout bonuses as the selected-defense range. Recovery data applies only to an accepted row for the same building and level. A valid Move can preview a new position with the saved structure's health. A refused or canceled Move leaves the saved layout as the analysis source. Selecting one building, leaving Village Mode, traveling or entering combat removes the approach marks.

Stable layouts reuse the prepared snapshot, route cache and existing instanced guide mesh. The analysis estimates geometric reach. The simulation still determines target choice, damage, reload timing, weather and wave outcomes.
