# VIS-13: original research and arsenal sources

For Johannes Franz Lang (`frcola`), [issue #218](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/218),
[Draft #356](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/356).

## Authored source

The original transparent source was generated with OpenAI `image_gen` on
17 November 2026 using the approved village and cabin material references. Its
unchanged [`services-v1.png`](../../../frontend/public/village/services-v1.png)
contains the existing Tech hub and arsenal. No offline edited or cropped image
file is emitted; read-only alpha inspection supplies runtime source rectangles.

The Tech hub request specified a compact warm stone/brass research landmark with
an arched entrance, amber windows, a large golden armillary around a navy globe,
gear sign and compact brass telescope. The arsenal remains a substantial navy
slate and timber armory, with iron-banded door, crossed-muskets sign, three-gun
rack, powder barrel and crate. Both use consistent front/right orthographic
perspective and upper-left light, with complete stone foundations and soft contact
shadows. No person, scenery, text or new active machine is added.

| Property | Inspected result |
|---|---|
| Native image | 1536×1024 RGBA PNG |
| Encoded bytes | 2,193,948 |
| SHA-256 | `d9091a95d8a3267f2c0790a06343d42d21232bc1c521bbcd1afc410914c991ff` |
| Whole-source corner alpha | 0 / 0 / 1 / 0 |
| Center separator alpha | 0 |
| Tech hub rectangle / relative foot | 20,125,698,776 / 345,761 |
| Arsenal rectangle / relative foot | 771,225,747,680 / 365,665 |

[Raw inspection](asset-report.json) includes complete meaningful alpha bounds at
threshold 16, solid bounds at 240 and measured foundation feet. Each source
rectangle retains all meaningful alpha plus 12px margin. The generation preview
contains colored RGB in its empty background, but that background and the center
separator have alpha 0 in the actual PNG; no opaque gradient is used in the game.

## Existing services and geometry

[`services.js`](../../../frontend/src/art/village/services.js) exports the agreed
VIS-32 sheet/frame contract. `island-techhub` retains 80×88/anchor 8 and
`island-arsenal` retains 80×80/anchor 8. The actual campaign/arsenal definitions
continue to own service ground positions, zones, colliders, unlocks and actions.
The armillary expresses research identity; it adds no new research action,
resource, price, timer or progression. The rack adds no free weapon.

The shared provider owns lazy decoding, bounded density, source-foot
normalization, preparation, world/atlas parity and cleanup. Registered source
failures reject clearly for retry. Unregistered families retain procedural art;
an unprepared synchronous placeholder retains its normalized logical foot.

## Executed checks and remaining evidence

From `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/art/village-services.test.js tests/cartoon-art.test.js
npm run build
node scripts/report-budget.js --check
```

Source/registry checks: **2 files / 7 tests passed in 862ms**, exit 0. They read
actual PNG dimensions/hash/alpha metadata, verify real existing service identities
and unchanged registered geometry, and guard complete source bounds, feet and
separation. Build completed in **925ms**; spoiler guard checked 241 text files and
12 protected lines without suspect elimination data. Cold title remains 18,698
JavaScript / 9,410 CSS bytes under unchanged 21,080 / 12,000 limits. Text lint from
the repository root reports **0 errors and 8 existing report-only findings**.

This branch supplies a source family. Shared registration, actual research/weapon
interactions, world/phase appearance and 1280×720 / 375×812 game captures remain
coordinated gates. A generated sheet does not establish gameplay, physical-device
performance, Safari, production deployment or final human visual acceptance. No
live migration, production flag, deployment or merge occurred.
