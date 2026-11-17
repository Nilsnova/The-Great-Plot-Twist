# WALL-05: canonical wall-chain quote

For Johannes Franz Lang (`frcola`), issue #246. This bounded pure server slice validates ordered connected cells, selects eligible unbuilt stable IDs, removes selected original empty-site reservations from the final-layout check, and computes exact current per-piece prices. It consumes trusted policy and complete reads from its dependency drafts. It does not charge, apply migrations or merge.

Plan: validate1–32 half-grid edge-sharing cells; require admitted rule1/capacity128; choose currently unlocked unbuilt IDs in stable order; validate whole final occupancy using the existing terrain/keep-out/footprint rules; quote per-piece Engineer rounding and remaining-after count; test invalid/off-grid/disconnected/occupied/locked/boundary cases and full measured ring in bounded runs. Build uses a distinct atomic transaction and retains quotedTotal in its immutable retry intent.

Risks: accidental unbuilt reservations, lost ID-position pairing, front/server mismatch, stale payer price, or a fake perfect ring. Explain-back: why remove selected old reservations together; why skip locked IDs; why does a quote not authorize payment?
