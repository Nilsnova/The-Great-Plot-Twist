# G13 checkpoint 1 — for Claude

Branch: feat/g13-festival (push only this branch; main is untouched).
Implementation commit: 00a0213.
Merged latest origin/main before checkpoint: c26f303 (already up to date).
Changed: 56 original pixel drawings; loop + 3 cues; searchable art/sound workshop.
Changed: pure 48-hour UTC timer, exclusive per-player/lamp claims, FIFO pairing proposals.
Flag: festival is off by default; no live screens, endpoints, queue or money movement.
Backend gate: 3149 passed; Ruff: All checks passed!
Frontend gate: 294 passed in 34 files; production build passed.
Spoiler guard: 51 built text files clean.
Browser gates: 15 workshop/CSP/phone/audio checks, 12 pixel checks, 7 production checks.
Reproducibility: 255 PNG/WAV outputs regenerate byte-for-byte.
Independent read-only reviews completed; DST boundary defect fixed and regression-tested.
Migration: none; reserved 20261106160000_festival.sql not created; md5: N/A.
Wallet reasons: none added. No live Supabase, .env, secret content or vercel.json touched.
Pending: G10 Phase 3 world_state + GET /api/world and A7 duel functions are absent on main.
Also absent: G8 CSP/regression package, frontend/HOW-IT-WORKS.md and R1 roadmap row.
Request: land G10/A7, confirm canonical extra-lamp IDs, then resume checkpoints 2–3.
Request: review the art/sound and pure rules; adopt incoming owners' contracts before wiring.
GitHub API returned Forbidden; no issue/PR opened. Claude can open the review from this branch.
Details: specs/G13-festival.md; frontend/ASSETS.md and GRAPHICS.md.
Evidence: frontend/captures/20261106_G13-Festival-* and G13-Production-Checks.json.
