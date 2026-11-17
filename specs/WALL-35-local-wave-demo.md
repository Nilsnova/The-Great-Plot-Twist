# WALL-35: explicit frozen local perimeter demo

For Johannes Franz Lang (`frcola`), tracking [WALL-35 #309](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/309). This controlled local legacy demo is separate from production perimeter V1 recovery/durable inputs. Production never emits perimeterDemo; no fake durable recovery RPC is added.

The fake freezes paid built defenses/levels/coordinates/health and crew when a policy1 wave starts, with bound wave headers and explicit version1/pathing/perimeterWalls options. A bounded parser validates, clones and freezes that declared input; malformed provided data refuses, never falls back to mutable getters. The controller uses it for legacy demo simulation only, retaining absent-demo legacy traces and existing V1 paths. Canonical1..128 health reports can finish the full ring, and start/join/current/reload preserve one input snapshot.

Prerequisites: WALL-29's exterior landing, WALL-31 local construction and WALL-30 world display. Own changes stay bounded; input/parser/controller/fake tests and actual root-coordinated screenshots/finish evidence are distinct proofs. No package, env change, migration, live activation or merge.
